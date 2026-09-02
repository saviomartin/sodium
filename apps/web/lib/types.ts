export type AwaitedReturn<T extends (...args: never[]) => unknown> = Awaited<
  ReturnType<T>
>;
