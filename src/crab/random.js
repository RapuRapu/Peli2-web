export const randomSource = { next: Math.random };

export function random() {
  return randomSource.next();
}
