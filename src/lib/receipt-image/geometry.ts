export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

export function isValidQuad(points: Quad): boolean {
  if (points.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)) return false;
  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % 4];
    const after = points[(index + 2) % 4];
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % 4];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
  return crosses.every(value => value > 0.001) && signedArea > 0.02;
}

function solveLinear(matrix: number[][]): number[] {
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) < 1e-10) throw new Error("Receipt corners cannot be transformed. Adjust the four corners.");
    [matrix[pivot], matrix[column]] = [matrix[column], matrix[pivot]];
    const divisor = matrix[column][column];
    for (let index = column; index <= 8; index++) matrix[column][index] /= divisor;
    for (let row = 0; row < 8; row++) if (row !== column) {
      const multiplier = matrix[row][column];
      for (let index = column; index <= 8; index++) matrix[row][index] -= multiplier * matrix[column][index];
    }
  }
  return matrix.map(row => row[8]);
}

export function destinationToSourceTransform(points: Quad): (x: number, y: number) => Point {
  if (!isValidQuad(points)) throw new Error("Receipt corners overlap or fall outside the photo.");
  const targets: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const matrix: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const [u, v] = targets[index];
    const { x, y } = points[index];
    matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }
  const h = solveLinear(matrix);
  return (u, v) => {
    const denominator = h[6] * u + h[7] * v + 1;
    return { x: (h[0] * u + h[1] * v + h[2]) / denominator, y: (h[3] * u + h[4] * v + h[5]) / denominator };
  };
}

export function mapDestinationToSource(points: Quad, x: number, y: number): Point {
  return destinationToSourceTransform(points)(x, y);
}
