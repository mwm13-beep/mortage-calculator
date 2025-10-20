// api/pdf.ts
export const config = { runtime: "edge" };

function makeTinyPdfBytes(message = "Mortgage PDF Placeholder") {
  // Minimal valid PDF with one page and a text string.
  // Keep it tiny; replace later with real renderer output.
  const pdf =
`%PDF-1.4
1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj
2 0 obj <</Type/Pages/Count 1/Kids[3 0 R]>> endobj
3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>> endobj
4 0 obj <</Length 52>>stream
BT /F1 12 Tf 50 100 Td (${message}) Tj ET
endstream endobj
5 0 obj <</Type/Font/Subtype/Type1/BaseFont/Helvetica>> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000062 00000 n 
0000000118 00000 n 
0000000270 00000 n 
0000000381 00000 n 
trailer <</Size 6/Root 1 0 R>>
startxref
468
%%EOF`;
  return new TextEncoder().encode(pdf);
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // (temporary) accept anything; wire schema in later task
  // const body = await req.json();

  // Stream the PDF (Edge-friendly)
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(makeTinyPdfBytes());
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="mortgage.pdf"',
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
