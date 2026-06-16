declare module "react-reconciler" {
  const Reconciler: (hostConfig: Record<string, unknown>) => any;
  export default Reconciler;
}

declare module "react-reconciler/constants" {
  export const ConcurrentRoot: number;
  export const ContinuousEventPriority: number;
  export const DefaultEventPriority: number;
  export const DiscreteEventPriority: number;
  export const IdleEventPriority: number;
  export const LegacyRoot: number;
  export const NoEventPriority: number;
}
