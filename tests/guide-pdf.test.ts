import test from 'node:test';
import assert from 'node:assert/strict';
import {validGuidePdf,GUIDE_LIMIT_BYTES} from '../src/lib/guide-pdf.ts';

test('validates a complete PDF file and refuses truncated or oversized uploads',()=>{
 const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
 assert.equal(validGuidePdf(bytes),true);
 assert.equal(validGuidePdf(bytes.subarray(0,bytes.byteLength-6)),false);
 assert.equal(validGuidePdf(new TextEncoder().encode('fake PDF file %%EOF')),false);
 assert.equal(validGuidePdf(new Uint8Array(GUIDE_LIMIT_BYTES+1)),false);
});

test('PDF verification tolerates line endings following %%EOF',()=>{
 const bytes=new TextEncoder().encode('%PDF-1.7\r\n%test data\n%%EOF\r\n');
 assert.equal(validGuidePdf(bytes),true);
});
