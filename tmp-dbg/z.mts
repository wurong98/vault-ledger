import { recordPatchSchema } from '../packages/contracts/src/index.js';
const out = recordPatchSchema.parse({ expectedRevision: 1, amount: '600.00', reason: '金额记错' });
console.log('parsed:', JSON.stringify(out));
console.log('keys:', Object.keys(out));
console.log('has contactId key:', 'contactId' in out, 'value:', out.contactId);
