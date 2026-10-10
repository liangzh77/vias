// Geometry shards and the catalogue index share one wire format. Everything that knows
// that shape lives here, so the packing rule can be tested without a browser, a network or
// a build step.
import {validPoint} from './track';
import type {Point} from './track';

// [lat, lon] or [lat, lon, ele] — bare numbers, rounded to ~0.1 m by the generator.
export type PackedPoint = [number, number] | [number, number, number];
export type PackedRoute = PackedPoint[][];
export type Shard = Record<string, PackedRoute>;

// The wire format is JSON, so anything can arrive. `Number(null)` is 0 and `Number('')` is 0,
// which would silently draw a line through the Gulf of Guinea, so the raw value has to be a
// real number *before* it is allowed to become a coordinate.
function packedNumber(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(message);
  return value;
}

export function unpackSegments(packed: unknown): Point[][] {
  if (!Array.isArray(packed) || !packed.length) throw new Error('轨迹数据为空');
  return packed.map((segment, index) => {
    if (!Array.isArray(segment) || !segment.length) throw new Error(`轨迹第 ${index + 1} 段没有点`);
    return segment.map(raw => {
      if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) throw new Error('轨迹点格式不正确');
      const point: Point = {
        lat: packedNumber(raw[0], '轨迹点纬度格式不正确'),
        lon: packedNumber(raw[1], '轨迹点经度格式不正确'),
      };
      // Coordinates arrive from the network: an out-of-range point would silently draw a
      // line across the world, so it is rejected instead of repaired.
      if (!validPoint(point)) throw new Error('轨迹点坐标超出范围');
      if (raw.length === 3) point.ele = packedNumber(raw[2], '轨迹点海拔格式不正确');
      return point;
    });
  });
}

export type ShardMap = {starts: number[]; counts: number[]; total: number};

// The catalogue index stores how many routes each shard holds and nothing else: one small
// array instead of a shard field repeated 14,430 times. The counts double as a version
// check — a shard whose key count does not match its slot belongs to another index.
export function shardMap(counts: unknown): ShardMap {
  if (!Array.isArray(counts) || !counts.length) throw new Error('分片表缺失');
  const starts: number[] = [];
  const kept: number[] = [];
  let total = 0;
  for (const count of counts) {
    if (!Number.isInteger(count) || count < 0) throw new Error('分片计数不合法');
    starts.push(total);
    kept.push(count);
    total += count;
  }
  return {starts, counts: kept, total};
}

export function shardOf(map: ShardMap, position: number): number {
  if (!Number.isInteger(position) || position < 0 || position >= map.total) throw new Error('轨迹序号超出目录范围');
  let low = 0;
  let high = map.starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (map.starts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function shardFileName(index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new Error('分片序号不合法');
  return `shard-${String(index).padStart(3, '0')}.json`;
}
