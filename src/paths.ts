export type NodePath = number[];

/**
 * Return the array of child indexes from a root to a target node.
 */
export function pathToNode(root: Node, target: Node): NodePath {
  const result = [];
  let node: Node | null = target;
  while (root !== node) {
    let index = 0;
    if (!node) {
      throw new Error('Could not find target from root');
    }
    const parent: Node | null = node.parentNode;
    while ((node = node.previousSibling) !== null) {
      ++index;
    }
    result.unshift(index);
    node = parent;
  }
  return result;
}

/** Return the node from a path of child indexes from a root. */
export function nodeFromPath(root: Node, path: NodePath): Node {
  for (const index of path) {
    root = root.childNodes[index];
  }
  return root;
}