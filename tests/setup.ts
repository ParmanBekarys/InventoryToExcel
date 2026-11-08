import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

// The services use the browser's DOMParser / XMLSerializer; Node needs stand-ins.
const g = globalThis as unknown as Record<string, unknown>;
if (typeof g.DOMParser === 'undefined') g.DOMParser = DOMParser;
if (typeof g.XMLSerializer === 'undefined') g.XMLSerializer = XMLSerializer;
