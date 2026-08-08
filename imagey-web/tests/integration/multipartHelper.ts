export function extractMultipartPart(body: Buffer, boundary: string, name: string): Buffer | null {
  const searchStr = `name="${name}"`;
  const nameIdx = body.indexOf(Buffer.from(searchStr));
  if (nameIdx === -1) return null;
  
  const bodyStart = body.indexOf(Buffer.from('\r\n\r\n'), nameIdx);
  if (bodyStart === -1) return null;
  
  const start = bodyStart + 4;
  const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), start);
  if (end === -1) return null;
  
  return body.subarray(start, end);
}
