'use strict';
const PUBLIC_CLARITY_EVENT='clarityhud.update.superfan-display';
function isPublicClarityEventAllowed(eventName){if(typeof eventName!=='string')return false;if(!eventName.startsWith('clarityhud.')&&!eventName.startsWith('clarityhud:'))return true;return eventName===PUBLIC_CLARITY_EVENT;}
module.exports={isPublicClarityEventAllowed,PUBLIC_CLARITY_EVENT};