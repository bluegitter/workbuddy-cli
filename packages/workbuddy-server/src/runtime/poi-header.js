'use strict';

const POI_HEADER_NAME = 'X-WorkBuddy-User-POI';

function buildPoiHeader(poi) {
  const base64Value = Buffer.from(JSON.stringify(poi), 'utf8').toString('base64');
  return { [POI_HEADER_NAME]: base64Value };
}

module.exports = { POI_HEADER_NAME, buildPoiHeader };
