/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Turns ```lang file=name mark=1,3 fences into <CodeBlock lang file mark code /> so highlighting
 * happens in one place (a server component using Shiki) instead of in a rehype pipeline.
 */
export function remarkCode() {
  return (tree: any) => {
    const visit = (node: any) => {
      if (!node.children) return;
      node.children = node.children.map((c: any) => {
        if (c.type !== "code") { visit(c); return c; }
        const meta: Record<string, string> = {};
        for (const m of (c.meta ?? "").matchAll(/(\w+)=(\S+)/g)) meta[m[1]!] = m[2]!;
                // String attributes only: expression attributes need an estree, which a hand-built node does not have.
        const attr = (name: string, value: string) => ({ type: "mdxJsxAttribute", name, value });
        return {
          type: "mdxJsxFlowElement", name: "CodeBlock", children: [],
          attributes: [attr("lang", c.lang ?? "text"), attr("code", c.value), attr("mark", meta.mark ?? ""), ...(meta.file ? [attr("file", meta.file)] : [])],
        };
      });
    };
    visit(tree);
  };
}
