const f = (x, m = new Map()) =>
  m.has(x)
    ? m.get(x)
    : m.set(
        x,
        x <= 1
          ? x
          : (x & 1
              ? f(x - 1, m) + f(x - 2, m)
              : (f(x >> 1, m) << 1) - f((x >> 1) - 1, m))
      ).get(x);

const g = (a, b = 0) =>
  a.length
    ? g(a.slice(1), b ^ f(a[0] % 10))
    : b >>> 0;
