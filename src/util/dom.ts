export function el(query: string, parent: ParentNode = document): Element {
  const element = parent.querySelector(query);
  if (!element) {
    throw new Error(`Element for query "${query}" not found`);
  }
  return element;
}
