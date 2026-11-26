#!/usr/bin/env python3
"""Compare independent open railway line sources against the IR corridor gap.

Potential bridges are reported for manual source/identity review only. No source
is snapped, merged, interpolated, or promoted into a production route.
"""
import argparse
import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, shape
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
    for label, path in sources:
        rows = read_jsonl(path)
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

    report = {
        "reference_source": "CC0 IR_Tracks",
        "reference_sections": list(SECTIONS),
        "IR_section_gap_m": round(left_union.distance(right_union), 2),
        "gap_segment_length_m": round(gap_line.length, 2),
        "projection_for_distance_checks": "EPSG:32643",
        "alternate_sources": results,
        "production_route_geometry_verified": False,
        "production_alert_enablement_allowed": False,
        "limitations": [
            "All alternate features are discovery candidates from a broad geographic envelope.",
            "A line near or intersecting both sections is not automatically the same main running line.",
            "No cross-source snapping, merging, interpolation, or chainage calibration is performed.",
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
