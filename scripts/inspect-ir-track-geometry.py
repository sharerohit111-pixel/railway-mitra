#!/usr/bin/env python3
"""Conservative QA of CC0 IR_Tracks/IR_Stations corridor candidates.

This script reports source geometry gaps. It deliberately does NOT join, interpolate,
or publish a production route polyline or infer train direction.
"""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

ROUTE_SECTIONS = ("LGH-KLYT", "KLYT-PLC")
ROUTE_STATIONS = {
    "LALGARH", "GAJNER", "KOLAYAT", "DIYATRA ROAD",
    "NOKHRA", "BAAP", "MALAR", "PHALODI",
}
PROJECT = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True).transform


def read_jsonl(path):
    items = []
    with Path(path).open(encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if line.strip():
                try:
                    items.append(json.loads(line))
                except Exception as exc:
                    raise SystemExit(f"Invalid JSONL {path}:{line_no}: {exc}")
    return items


def chainage(properties, km_key, m_key):
    try:
        km = float(properties[km_key])
        metres = float(properties[m_key] or 0)
        value = km + metres / 1000.0
        return value if math.isfinite(value) else None
    except (KeyError, TypeError, ValueError):
        return None


def merged_intervals(features):
    intervals = []
    for feature in features:
        props = feature.get("properties") or {}
        start = chainage(props, "distfromkm", "distfromm")
        end = chainage(props, "disttokm", "disttom")
        if start is not None and end is not None:
            intervals.append((min(start, end), max(start, end)))
    intervals.sort()
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1] + 0.001:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    gaps = []
    for left, right in zip(merged, merged[1:]):
        if right[0] - left[1] > 0.001:
            gaps.append({"from_km": round(left[1], 3),
                         "to_km": round(right[0], 3),
                         "gap_km": round(right[0] - left[1], 3)})
    return merged, gaps


def line_parts(geometry):
    if geometry is None:
        return []
    if geometry.geom_type == "LineString":
        return [geometry] if not geometry.is_empty and len(geometry.coords) >= 2 else []
    if geometry.geom_type == "MultiLineString":
        return [part for part in geometry.geoms if not part.is_empty and len(part.coords) >= 2]
    return []


def endpoint_components(parts, tolerance_m=10.0):
    """Connected components using endpoint snapping only; not topology repair."""
    endpoints = []
    for index, line in enumerate(parts):
        endpoints.append((index, line.coords[0]))
        endpoints.append((index, line.coords[-1]))
    parent = list(range(len(parts)))

    def find(value):
        while parent[value] != value:
            parent[value] = parent[parent[value]]
            value = parent[value]
        return value

    def union(left, right):
        left, right = find(left), find(right)
        if left != right:
            parent[right] = left

    for i, (line_i, point_i) in enumerate(endpoints):
        for line_j, point_j in endpoints[i + 1:]:
            if line_i != line_j and math.hypot(point_i[0] - point_j[0], point_i[1] - point_j[1]) <= tolerance_m:
                union(line_i, line_j)

    groups = defaultdict(int)
    for index in range(len(parts)):
        groups[find(index)] += 1
    return sorted(groups.values(), reverse=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tracks", required=True)
    parser.add_argument("--stations", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    raw_tracks = read_jsonl(args.tracks)
    raw_stations = read_jsonl(args.stations)

    by_section = defaultdict(list)
    projected = defaultdict(list)
    for feature in raw_tracks:
        props = feature.get("properties") or {}
        section = props.get("tmssection")
        if section not in ROUTE_SECTIONS:
            continue
        geom = feature.get("geometry")
        if not geom:
            continue
        projected_geom = transform(PROJECT, shape(geom))
        by_section[section].append((feature, projected_geom))
        projected[section].extend(line_parts(projected_geom))

    section_report = {}
    interval_sets = {}
    for section in ROUTE_SECTIONS:
        entries = by_section[section]
        merged, gaps = merged_intervals([entry[0] for entry in entries])
        interval_sets[section] = merged
        parts = projected[section]
        component_sizes = endpoint_components(parts)
        section_report[section] = {
            "feature_count": len(entries),
            "geometry_part_count": len(parts),
            "unique_objectid_count": len({
                (entry[0].get("properties") or {}).get("objectid")
                for entry in entries
                if (entry[0].get("properties") or {}).get("objectid") is not None
            }),
            "chainage_coverage_intervals_km": [
                [round(start, 3), round(end, 3)] for start, end in merged
            ],
            "chainage_gaps": gaps,
            "endpoint_components_with_10m_snap": component_sizes,
            "summed_geometry_length_km_not_route_length": round(
                sum(part.length for part in parts) / 1000.0, 3
            ),
        }

    cross_gap = None
    left = projected["LGH-KLYT"]
    right = projected["KLYT-PLC"]
    best = None
    for left_index, left_line in enumerate(left):
        for right_index, right_line in enumerate(right):
            distance = left_line.distance(right_line)
            if best is None or distance < best[0]:
                best = (distance, left_index, right_index)
    if best:
        distance, li, ri = best
        left_record = next(
            (feature for feature, geom in by_section["LGH-KLYT"]
             if any(part.equals(left[li]) for part in line_parts(geom))), None
        )
        right_record = next(
            (feature for feature, geom in by_section["KLYT-PLC"]
             if any(part.equals(right[ri]) for part in line_parts(geom))), None
        )
        def identity(feature):
            if not feature:
                return None
            props = feature.get("properties") or {}
            return {
                "objectid": props.get("objectid"),
                "chainage_from_km": chainage(props, "distfromkm", "distfromm"),
                "chainage_to_km": chainage(props, "disttokm", "disttom"),
            }
        cross_gap = {
            "minimum_geometry_separation_m": round(distance, 2),
            "LGH_KLYT_feature": identity(left_record),
            "KLYT_PLC_feature": identity(right_record),
            "warning": "A spatial gap is present; do not bridge or interpolate it as track geometry.",
        }

    station_report = []
    for station in raw_stations:
        props = station.get("properties") or {}
        name = str(props.get("sttnname") or "").strip().upper()
        if name not in ROUTE_STATIONS or not station.get("geometry"):
            continue
        station_geom = transform(PROJECT, shape(station["geometry"]))
        ranked = []
        for section in ROUTE_SECTIONS:
            for feature, geom in by_section[section]:
                distance = geom.distance(station_geom)
                ranked.append((distance, section, feature))
        if not ranked:
            continue
        distance, section, feature = min(ranked, key=lambda row: row[0])
        fprops = feature.get("properties") or {}
        station_report.append({
            "station": name,
            "station_code": props.get("sttncode"),
            "station_section": props.get("tmssection"),
            "station_chainage_km": chainage(props, "distkm", "distm"),
            "nearest_track_section": section,
            "nearest_track_distance_m": round(distance, 2),
            "nearest_track_objectid": fprops.get("objectid"),
            "nearest_track_chainage_from_km": chainage(fprops, "distfromkm", "distfromm"),
            "nearest_track_chainage_to_km": chainage(fprops, "disttokm", "disttom"),
        })
    station_report.sort(key=lambda row: (
        row["station_chainage_km"] if row["station_chainage_km"] is not None else 1e9,
        row["station"]
    ))

    blockers = []
    if section_report["LGH-KLYT"]["chainage_coverage_intervals_km"] and section_report["KLYT-PLC"]["chainage_coverage_intervals_km"]:
        left_end = section_report["LGH-KLYT"]["chainage_coverage_intervals_km"][-1][1]
        right_start = section_report["KLYT-PLC"]["chainage_coverage_intervals_km"][0][0]
        if right_start - left_end > 0.001:
            blockers.append({
                "type": "chainage_gap",
                "from_km": left_end,
                "to_km": right_start,
                "gap_km": round(right_start - left_end, 3),
            })
    if cross_gap and cross_gap["minimum_geometry_separation_m"] > 100:
        blockers.append({
            "type": "geometry_discontinuity",
            "separation_m": cross_gap["minimum_geometry_separation_m"],
        })
    for station in station_report:
        if station["nearest_track_distance_m"] > 100:
            blockers.append({
                "type": "station_anchor_offset",
                "station": station["station"],
                "nearest_track_distance_m": station["nearest_track_distance_m"],
            })

    report = {
        "source": "CC0 IR_Tracks and IR_Stations release assets",
        "projection_for_distance_checks": "EPSG:32643",
        "route_sections": section_report,
        "cross_section_gap": cross_gap,
        "station_anchor_checks": station_report,
        "production_route_geometry_verified": False,
        "production_alert_enablement_allowed": False,
        "blockers": blockers,
        "limitations": [
            "Candidate features were selected by a broad geographic envelope, not by a validated route ID.",
            "Summed geometry length includes parallel tracks and asset fragments; it is not route length.",
            "Endpoint connectivity uses a 10 metre snap tolerance and is diagnostic only.",
            "Station point-to-track distance is not train distance and station points may represent station centres.",
            "No route polyline, chainage calibration, track identity, or train direction is inferred.",
        ],
    }
    Path(args.output).write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
