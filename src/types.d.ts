declare module "pdf-parse/lib/pdf-parse.js" {
  const pdf: (b: Buffer) => Promise<{ text: string }>;
  export default pdf;
}
