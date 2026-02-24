declare module "d3-force-3d" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type NodeDatum = any;

  interface ForceCollide {
    radius(fn: (node: NodeDatum) => number): ForceCollide;
    strength(s: number): ForceCollide;
    iterations(n: number): ForceCollide;
    (alpha: number): void;
  }

  interface ForceX {
    x(fn: (node: NodeDatum) => number): ForceX;
    strength(s: number): ForceX;
    (alpha: number): void;
  }

  interface ForceY {
    y(fn: (node: NodeDatum) => number): ForceY;
    strength(s: number): ForceY;
    (alpha: number): void;
  }

  export function forceCollide(): ForceCollide;
  export function forceX(): ForceX;
  export function forceY(): ForceY;
  export function forceCenter(x?: number, y?: number): unknown;
  export function forceManyBody(): unknown;
  export function forceLink(): unknown;
  export function forceSimulation(): unknown;
  export function forceRadial(): unknown;
  export function forceZ(): unknown;
}
