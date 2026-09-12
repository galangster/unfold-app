type TreeNode = { parent?: TreeNode | null; props?: { onPress?: unknown } };

/** The nearest ancestor (or the node itself) whose props carry an onPress handler. */
export function pressableAncestor(node: TreeNode): { props: { onPress: () => void | Promise<void> } } {
  let current: TreeNode | null | undefined = node;
  while (current && typeof current.props?.onPress !== 'function') {
    current = current.parent;
  }
  if (!current || typeof current.props?.onPress !== 'function') {
    throw new Error('expected a pressable ancestor');
  }
  return current as { props: { onPress: () => void | Promise<void> } };
}
