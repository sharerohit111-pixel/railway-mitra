#!/usr/bin/env python3
"""Compare independent open railway line sources against the IR corridor gap.

Potential bridges are reported for manual source/identity review only. No source
is snapped, merged, interpolated, or promoted into a production route.
"""
import argparse
import json
import math
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import nearest_points, transform, unary_union

PROJECT = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True).transform
SECTIONS = ("LGH-KLYT", "KLYT-PLC")


def read_jsonl(path):
    rows = []
    with Path(path).open(encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if line.strip():
                try:
                    rows.append(json.loads(line))
                except Exception as exc:
                    raise SystemExit(f"Invalid JSONL {path}:{line_no}: {exc}")
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ir-tracks", required=True)
    parser.add_argument("--soi-tracks", required=True)
    parser.add_argument("--gatishakti-tracks", required=True)
    parser.add_argument("--stations", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--route-output", required=True)
    args = parser.parse_args()

    ir_rows = read_jsonl(args.ir_tracks)
    station_rows = read_jsonl(args.stations)
    sections = {name: [] for name in SECTIONS}
    for feature in ir_rows:
        props = feature.get("properties") or {}
        name = props.get("tmssection")
        if name in sections and feature.get("geometry"):
            sections[name].append(transform(PROJECT, shape(feature["geometry"])))
    if not all(sections.values()):
        raise SystemExit("Required IR corridor sections are missing")

    left_union = unary_union(sections["LGH-KLYT"])
    right_union = unary_union(sections["KLYT-PLC"])
    left_near, right_near = nearest_points(left_union, right_union)
    gap_line = LineString([left_near, right_near])
    kolayat = next(
        (row for row in station_rows
         if str((row.get("properties") or {}).get("sttnname", "")).strip().upper() == "KOLAYAT"
         and row.get("geometry")),
        None,
    )
    kolayat_point = transform(PROJECT, shape(kolayat["geometry"])) if kolayat else None

    sources = [
        ("SOI_Railway_Tracks", args.soi_tracks),
        ("GatiShakti_Railway_tracks", args.gatishakti_tracks),
    ]
    results = {}
    source_rows = {}
    for label, path in sources:
        rows = read_jsonl(path)
        source_rows[label] = rows
        candidates = []
        geometry_types = {}
        property_keys = set()
        for feature in rows:
            geom_data = feature.get("geometry")
            if not geom_data:
                continue
            props = feature.get("properties") or {}
            property_keys.update(map(str, props.keys()))
            geom_type = geom_data.get("type", "null")
            geometry_types[geom_type] = geometry_types.get(geom_type, 0) + 1
            geom = transform(PROJECT, shape(geom_data))
            if geom.is_empty or geom.geom_type not in ("LineString", "MultiLineString", "GeometryCollection"):
                continue
            d_left = geom.distance(left_union)
            d_right = geom.distance(right_union)
            d_gap = geom.distance(gap_line)
            d_kolayat = geom.distance(kolayat_point) if kolayat_point else None
            candidates.append({
                "feature": feature,
                "distance_to_LGH_KLYT_m": d_left,
                "distance_to_KLYT_PLC_m": d_right,
                "distance_to_gap_segment_m": d_gap,
                "distance_to_Kolayat_station_point_m": d_kolayat,
            })
        candidates.sort(key=lambda row: row["distance_to_gap_segment_m"])
        near_gap = [row for row in candidates if row["distance_to_gap_segment_m"] <= 2000]
        potential_bridges = [
            row for row in candidates
            if row["distance_to_LGH_KLYT_m"] <= 100
            and row["distance_to_KLYT_PLC_m"] <= 100
        ]

        def describe(row):
            props = row["feature"].get("properties") or {}
            return {
                "feature_id": row["feature"].get("id", props.get("objectid", props.get("id"))),
                "properties": {
                    key: props.get(key) for key in (
                        "name", "railway", "division", "section", "tmssection",
                        "route_name", "route", "line_name", "objectid", "id",
                        "from_km", "to_km", "distfromkm", "disttokm",
                    ) if props.get(key) not in (None, "", " ")
                },
                "distance_to_LGH_KLYT_m": round(row["distance_to_LGH_KLYT_m"], 2),
                "distance_to_KLYT_PLC_m": round(row["distance_to_KLYT_PLC_m"], 2),
                "distance_to_gap_segment_m": round(row["distance_to_gap_segment_m"], 2),
                "distance_to_Kolayat_station_point_m": (
                    round(row["distance_to_Kolayat_station_point_m"], 2)
                    if row["distance_to_Kolayat_station_point_m"] is not None else None
                ),
                "geometry_type": row["feature"].get("geometry", {}).get("type"),
            }

        results[label] = {
            "total_candidate_features": len(rows),
            "line_features_with_geometry": len(candidates),
            "geometry_types": geometry_types,
            "property_keys": sorted(property_keys),
            "features_within_2km_of_IR_section_gap": [describe(row) for row in near_gap[:25]],
            "potential_features_within_100m_of_both_IR_sections": [
                describe(row) for row in potential_bridges[:25]
            ],
            "note": "Potential spatial bridges only; source identity, route identity, chainage and operational validity are not verified.",
        }

    # Build a source-faithful candidate route only when the GatiShakti
    # segments are chainage-contiguous and their original endpoints meet.
    gati_rows = source_rows["GatiShakti_Railway_tracks"]
    route_features = []
    for feature in gati_rows:
        props = feature.get("properties") or {}
        if (
            props.get("route") == "LGH-PLC"
            and str(props.get("route_code")) == "671"
            and str(props.get("line_code")) == "003"
            and props.get("line") == "SL"
            and props.get("gauge") == "BG"
            and feature.get("geometry")
        ):
            try:
                start_km = float(props.get("km_from")) + float(props.get("met_from") or 0) / 1000.0
                end_km = float(props.get("km_to")) + float(props.get("met_to") or 0) / 1000.0
            except (TypeError, ValueError):
                continue
            route_features.append((start_km, end_km, feature))
    route_features.sort(key=lambda row: row[0])

    route_candidate = {
        "candidate_found": False,
        "continuous": False,
        "source_feature_count": len(route_features),
        "source_feature_ids": [],
        "segments": [],
        "station_anchor_checks": [],
        "independent_SOI_alignment": None,
        "geometry_exported": False,
    }
    route_geojson = {"type": "FeatureCollection", "features": []}
    if route_features:
        station_by_name = {
            str((row.get("properties") or {}).get("sttnname", "")).strip().upper(): row
            for row in station_rows if row.get("geometry")
        }
        lalgarh_row = station_by_name.get("LALGARH")
        lalgarh_point = transform(PROJECT, shape(lalgarh_row["geometry"])) if lalgarh_row else None
        oriented_segments = []
        previous_end = None
        previous_chainage = None
        endpoint_gaps = []
        chainage_gaps = []
        segment_metrics = []
        chainage_ordered = True

        for index, (start_km, end_km, feature) in enumerate(route_features):
            geom_data = feature.get("geometry") or {}
            geom = shape(geom_data)
            if geom.geom_type != "LineString" or geom.is_empty or len(geom.coords) < 2:
                chainage_ordered = False
                continue
            raw_coords = list(geom.coords)
            projected_geom = transform(PROJECT, geom)
            projected_coords = list(projected_geom.coords)
            if index == 0 and lalgarh_point is not None:
                reverse = Point(projected_coords[-1]).distance(lalgarh_point) < Point(projected_coords[0]).distance(lalgarh_point)
            elif previous_end is not None:
                reverse = math.hypot(previous_end[0] - projected_coords[-1][0], previous_end[1] - projected_coords[-1][1]) < math.hypot(previous_end[0] - projected_coords[0][0], previous_end[1] - projected_coords[0][1])
            else:
                reverse = False
            if reverse:
                raw_coords.reverse()
                projected_coords.reverse()
                projected_geom = LineString(projected_coords)

            endpoint_gap = None
            if previous_end is not None:
                endpoint_gap = math.hypot(previous_end[0] - projected_coords[0][0], previous_end[1] - projected_coords[0][1])
                endpoint_gaps.append(endpoint_gap)
                if endpoint_gap > 0.01:
                    chainage_ordered = False
            if previous_chainage is not None:
                chainage_gap = start_km - previous_chainage
                chainage_gaps.append(chainage_gap)
                if abs(chainage_gap) > 0.001:
                    chainage_ordered = False

            props = feature.get("properties") or {}
            feature_id = props.get("objectid", feature.get("id"))
            segment_length_km = projected_geom.length / 1000.0
            segment_metrics.append({
                "feature_id": feature_id,
                "section": props.get("tmssection"),
                "division": props.get("division"),
                "chainage_from_km": round(start_km, 3),
                "chainage_to_km": round(end_km, 3),
                "geometry_length_km": round(segment_length_km, 3),
                "geometry_minus_chainage_km": round(segment_length_km - (end_km - start_km), 3),
                "orientation_reversed_from_source": reverse,
                "connection_gap_from_previous_m": round(endpoint_gap, 3) if endpoint_gap is not None else None,
            })
            oriented_segments.append((raw_coords, projected_geom, start_km, end_km, feature_id))
            previous_end = projected_coords[-1]
            previous_chainage = end_km

        route_continuous = (
            len(oriented_segments) == len(route_features)
            and len(oriented_segments) >= 2
            and chainage_ordered
            and all(abs(gap) <= 0.001 for gap in chainage_gaps)
            and all(gap <= 0.01 for gap in endpoint_gaps)
        )
        route_candidate["candidate_found"] = True
        route_candidate["continuous"] = route_continuous
        route_candidate["source_feature_ids"] = [segment[4] for segment in oriented_segments]
        route_candidate["segments"] = segment_metrics
        route_candidate["chainage_gaps_km"] = [round(gap, 6) for gap in chainage_gaps]
        route_candidate["endpoint_gaps_m"] = [round(gap, 3) for gap in endpoint_gaps]
        if oriented_segments:
            combined_coords = []
            projected_parts = []
            cumulative_lengths = []
            total_length = 0.0
            for raw_coords, projected_geom, start_km, end_km, feature_id in oriented_segments:
                if not combined_coords:
                    combined_coords.extend(raw_coords)
                elif math.hypot(
                    transform(PROJECT, Point(combined_coords[-1])).x - projected_geom.coords[0][0],
                    transform(PROJECT, Point(combined_coords[-1])).y - projected_geom.coords[0][1],
                ) <= 0.01:
                    combined_coords.extend(raw_coords[1:])
                projected_parts.append(projected_geom)
                cumulative_lengths.append((total_length, total_length + projected_geom.length, start_km, end_km))
                total_length += projected_geom.length

            if route_continuous:
                route_geom_wgs84 = LineString(combined_coords)
                route_geom_projected = transform(PROJECT, route_geom_wgs84)
                route_candidate["geometry_length_km"] = round(route_geom_projected.length / 1000.0, 3)
                route_candidate["geometry_is_valid"] = route_geom_projected.is_valid
                route_candidate["geometry_is_simple"] = route_geom_projected.is_simple
                route_candidate["max_source_vertex_spacing_m"] = round(
                    max(
                        math.hypot(b[0] - a[0], b[1] - a[1])
                        for a, b in zip(route_geom_projected.coords, list(route_geom_projected.coords)[1:])
                    ), 2
                )
                if not route_geom_projected.is_valid or not route_geom_projected.is_simple:
                    raise SystemExit("GatiShakti route candidate geometry is invalid or self-intersecting")
                route_candidate["published_chainage_length_km"] = round(
                    route_features[-1][1] - route_features[0][0], 3
                )
                route_candidate["geometry_minus_chainage_km"] = round(
                    route_geom_projected.length / 1000.0 - (route_features[-1][1] - route_features[0][0]), 3
                )
                route_candidate["geometry_exported"] = True
                route_geojson["features"].append({
                    "type": "Feature",
                    "properties": {
                        "source": "GatiShakti_Railway_tracks",
                        "route": "LGH-PLC",
                        "route_code": "671",
                        "line_code": "003",
                        "line": "SL",
                        "gauge": "BG",
                        "candidate_status": "NOT_PRODUCTION_VERIFIED",
                        "source_feature_ids": route_candidate["source_feature_ids"],
                        "chainage_from_km": route_features[0][0],
                        "chainage_to_km": route_features[-1][1],
                        "chainage_calibration": [
                            {
                                "source_feature_id": segment[4],
                                "measure_from_m": round(calibration[0], 3),
                                "measure_to_m": round(calibration[1], 3),
                                "chainage_from_km": round(calibration[2], 6),
                                "chainage_to_km": round(calibration[3], 6),
                            }
                            for segment, calibration in zip(oriented_segments, cumulative_lengths)
                        ],
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[float(x), float(y)] for x, y in route_geom_wgs84.coords],
                    },
                })

                route_station_names = {
                    "LALGARH", "GAJNER", "KOLAYAT", "DIYATRA ROAD",
                    "NOKHRA", "BAAP", "MALAR", "PHALODI",
                }
                for name in sorted(route_station_names):
                    station = station_by_name.get(name)
                    if not station:
                        continue
                    props = station.get("properties") or {}
                    point = transform(PROJECT, shape(station["geometry"]))
                    along = route_geom_projected.project(point)
                    estimated_chainage = None
                    for seg_start_m, seg_end_m, seg_start_km, seg_end_km in cumulative_lengths:
                        if along <= seg_end_m + 0.001:
                            fraction = max(0.0, min(1.0, (along - seg_start_m) / max(seg_end_m - seg_start_m, 0.001)))
                            estimated_chainage = seg_start_km + fraction * (seg_end_km - seg_start_km)
                            break
                    try:
                        station_chainage = float(props.get("distkm")) + float(props.get("distm") or 0) / 1000.0
                    except (TypeError, ValueError):
                        station_chainage = None
                    route_candidate["station_anchor_checks"].append({
                        "station": name,
                        "station_chainage_km": round(station_chainage, 3) if station_chainage is not None else None,
                        "projected_route_chainage_km": round(estimated_chainage, 3) if estimated_chainage is not None else None,
                        "chainage_delta_km": round(estimated_chainage - station_chainage, 3) if estimated_chainage is not None and station_chainage is not None else None,
                        "station_to_route_geometry_m": round(route_geom_projected.distance(point), 2),
                    })

                anchor_checks = route_candidate["station_anchor_checks"]
                anchors_ok = len(anchor_checks) == 8 and all(
                    row["station_to_route_geometry_m"] <= 500.0
                    and row["chainage_delta_km"] is not None
                    and abs(row["chainage_delta_km"]) <= 0.5
                    for row in anchor_checks
                )
                route_candidate["station_anchor_validation_passed"] = anchors_ok
                if not anchors_ok:
                    raise SystemExit("GatiShakti route candidate failed station anchor checks")

                soi_rows = source_rows["SOI_Railway_Tracks"]
                soi_ranked = []
                for feature in soi_rows:
                    if not feature.get("geometry"):
                        continue
                    geom = transform(PROJECT, shape(feature["geometry"]))
                    if geom.geom_type not in ("LineString", "MultiLineString"):
                        continue
                    vertices = (
                        list(geom.coords) if geom.geom_type == "LineString"
                        else [point for part in geom.geoms for point in part.coords]
                    )
                    offsets = [Point(point).distance(route_geom_projected) for point in vertices]
                    if not offsets:
                        continue
                    soi_ranked.append((
                        max(offsets),
                        sorted(offsets)[len(offsets)//2],
                        geom.distance(route_geom_projected),
                        feature,
                        geom,
                        offsets,
                    ))
                soi_ranked.sort(key=lambda item: (item[0], item[1], item[2]))
                aligned_soi = [item for item in soi_ranked if item[0] <= 100.0]
                oriented_soi = []
                for item in aligned_soi:
                    max_offset, median_offset, distance, feature, geom, offsets = item
                    if geom.geom_type == "LineString":
                        parts = [geom]
                    else:
                        parts = list(geom.geoms)
                    for part in parts:
                        coords = list(part.coords)
                        if len(coords) < 2:
                            continue
                        start_measure = route_geom_projected.project(Point(coords[0]))
                        end_measure = route_geom_projected.project(Point(coords[-1]))
                        if end_measure < start_measure:
                            coords.reverse()
                            start_measure, end_measure = end_measure, start_measure
                        oriented_soi.append({
                            "feature": feature,
                            "coords": coords,
                            "start_measure": start_measure,
                            "end_measure": end_measure,
                            "max_offset": max_offset,
                            "median_offset": median_offset,
                            "distance": distance,
                        })
                oriented_soi.sort(key=lambda item: item["start_measure"])
                soi_endpoint_gaps = []
                soi_measure_gaps = []
                combined_soi_coords = []
                max_soi_vertex_spacing = 0.0
                all_soi_offsets = []
                for index, item in enumerate(oriented_soi):
                    coords = item["coords"]
                    all_soi_offsets.extend(
                        Point(point).distance(route_geom_projected) for point in coords
                    )
                    for left_point, right_point in zip(coords, coords[1:]):
                        max_soi_vertex_spacing = max(
                            max_soi_vertex_spacing,
                            math.hypot(left_point[0] - right_point[0], left_point[1] - right_point[1]),
                        )
                    if index:
                        previous = combined_soi_coords[-1]
                        gap = math.hypot(previous[0] - coords[0][0], previous[1] - coords[0][1])
                        soi_endpoint_gaps.append(gap)
                        soi_measure_gaps.append(
                            item["start_measure"] - oriented_soi[index - 1]["end_measure"]
                        )
                        if gap <= 0.01:
                            combined_soi_coords.extend(coords[1:])
                        else:
                            combined_soi_coords.extend(coords)
                    else:
                        combined_soi_coords.extend(coords)
                soi_chain_continuous = (
                    len(oriented_soi) >= 2
                    and all(gap <= 0.01 for gap in soi_endpoint_gaps)
                    and all(abs(gap) <= 0.001 for gap in soi_measure_gaps)
                )
                if soi_ranked:
                    best_max, best_median, best_distance, best_feature, _, _ = soi_ranked[0]
                    best_props = best_feature.get("properties") or {}
                    route_candidate["independent_SOI_alignment"] = {
                        "selection_method": "all SOI line features with every sampled vertex within 100m of the GatiShakti candidate",
                        "best_feature_id_by_max_vertex_offset": best_props.get("objectid"),
                        "best_feature_railway": best_props.get("rly_name"),
                        "best_feature_line_type": best_props.get("line_type"),
                        "best_feature_additional_info": best_props.get("addl_info"),
                        "best_feature_minimum_geometry_separation_m": round(best_distance, 2),
                        "best_feature_max_vertex_offset_m": round(best_max, 2),
                        "best_feature_median_vertex_offset_m": round(best_median, 2),
                        "aligned_feature_count": len(oriented_soi),
                        "aligned_feature_ids": [
                            item["feature"].get("properties", {}).get("objectid")
                            for item in oriented_soi
                        ],
                        "continuous_aligned_chain": soi_chain_continuous,
                        "endpoint_gaps_m": [round(gap, 3) for gap in soi_endpoint_gaps],
                        "route_measure_gaps_m": [round(gap, 3) for gap in soi_measure_gaps],
                        "route_measure_coverage_km": (
                            [round(oriented_soi[0]["start_measure"] / 1000.0, 3),
                             round(oriented_soi[-1]["end_measure"] / 1000.0, 3)]
                            if oriented_soi else None
                        ),
                        "all_aligned_vertices_max_offset_m": round(max(all_soi_offsets), 2) if all_soi_offsets else None,
                        "all_aligned_vertices_median_offset_m": round(sorted(all_soi_offsets)[len(all_soi_offsets)//2], 2) if all_soi_offsets else None,
                        "max_vertex_spacing_m": round(max_soi_vertex_spacing, 2),
                    }

    if not route_candidate["candidate_found"] or not route_candidate["continuous"] or not route_candidate["geometry_exported"]:
        raise SystemExit("GatiShakti LGH-PLC source route is not a continuous, exportable candidate")
    soi_alignment = route_candidate.get("independent_SOI_alignment")
    if (
        not soi_alignment
        or not soi_alignment.get("continuous_aligned_chain")
        or soi_alignment.get("all_aligned_vertices_max_offset_m", 1e9) > 100.0
    ):
        raise SystemExit("Independent SOI geometry does not form a continuous alignment within 100 metres")

    Path(args.route_output).write_text(
        json.dumps(route_geojson, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    report = {
        "reference_source": "CC0 IR_Tracks",
        "reference_sections": list(SECTIONS),
        "IR_section_gap_m": round(left_union.distance(right_union), 2),
        "gap_segment_length_m": round(gap_line.length, 2),
        "projection_for_distance_checks": "EPSG:32643",
        "alternate_sources": results,
        "gati_lgh_plc_route_candidate": route_candidate,
        "production_route_geometry_verified": False,
        "production_alert_enablement_allowed": False,
        "limitations": [
            "All alternate features are discovery candidates from a broad geographic envelope.",
            "The GatiShakti route candidate is source-derived but still requires authoritative route/asset validation and field or official operational verification.",
            "No cross-source snapping, merging, or interpolation is performed.",
            "Station coordinates are comparison anchors only, not railway track geometry.",
        ],
    }
    Path(args.output).write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
