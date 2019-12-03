import { URL } from 'url';

import { parse as parsePhoneNumber, format as formatPhoneNumber } from 'libphonenumber-js';
import cheerio from 'cheerio';
import fetch from 'node-fetch';
import R from 'ramda';
import RA from 'ramda-adjunct';

import AREAS_OF_PRACTICE_EN from './AREAS_OF_PRACTICE_EN';
import AREAS_OF_PRACTICE_EN_FR_MAP from './AREAS_OF_PRACTICE_EN_FR_MAP';
import AREAS_OF_PRACTICE_FR from './AREAS_OF_PRACTICE_FR';
import LANGUAGES from './LANGUAGES';
import REGIONS from './REGIONS';

const baseUrl = 'https://www.oaciq.com';
const searchUrl = '/cgi-bin/WebObjects/RegistrePlus.woa/wa/chercher';
const viewMemberInfoUrl = '/cgi-bin/WebObjects/RegistrePlus.woa/wa/voirInfoMembre';
const idParamName = 'noMembre';
const notAvailableTexts = ['not available', 'non disponible'];

async function listBrokers({
  agencyName = '',
  areaOfPractice = '',
  city = '',
  includeRevoked = false,
  language = 'French',
  licenseNumber = '',
  name = '',
  page = 1,
  region = ''
}) {
  if (!R.contains(language)(LANGUAGES)) {
    throw new RangeError('Invalid value for `language` option');
  }

  if (!R.isEmpty(region) && !R.contains(region)(REGIONS)) {
    throw new RangeError('Invalid value for `region` option');
  }

  const normalizedAreaOfPractice = R.pathOr(areaOfPractice, [areaOfPractice], AREAS_OF_PRACTICE_EN_FR_MAP);

  if (!R.isEmpty(normalizedAreaOfPractice) && !R.contains(normalizedAreaOfPractice)(AREAS_OF_PRACTICE_FR)) {
    throw new RangeError('Invalid value for `areaOfPractice` option');
  }

  const url = new URL(searchUrl, baseUrl);
  url.searchParams.append('langue', language);
  url.searchParams.append('nomCourtier', name);
  url.searchParams.append('nomAgence', agencyName);
  url.searchParams.append('region', region);
  url.searchParams.append('ville', city);
  url.searchParams.append('champPratique', normalizedAreaOfPractice);
  url.searchParams.append('numero', licenseNumber);
  url.searchParams.append('estChercherRevoque', String(includeRevoked));
  url.searchParams.append('numeroPage', String(page));

  const res = await fetch(String(url));
  const body = await res.text();

  const $ = cheerio.load(body);
  const rows = $('#resultItem > .row').toArray();

  return R.compose(R.map($row => ({
    id: $row.attr('id'),
    name: $row.find('.col-xs-12:nth-of-type(1) > .hidden-xs > a.lienFiche').text().trim(),
    agency: R.ifElse(R.propSatisfies(R.gt(R.__, 0), 'length'), $agencyLink => ({
      id: new URL($agencyLink.prop('href'), baseUrl).searchParams.get(idParamName),
      name: $agencyLink.text().trim()
    }), R.always(null))($row.find('.col-xs-12:nth-of-type(2) > .hidden-xs > a.lienFiche')),
    location: $row.find('.col-xs-12:nth-of-type(3) > .hidden-xs').text().trim()
  })), R.map(row => $(row)))(rows);
}

async function getBrokerDetails({
  id,
  language = 'French'
}) {
  if (R.isNil(id)) {
    throw new Error('`id` option is required');
  }

  if (!R.contains(language)(LANGUAGES)) {
    throw new RangeError('Invalid value for `language` option');
  }

  const url = new URL(viewMemberInfoUrl, baseUrl);
  url.searchParams.append(idParamName, id);
  url.searchParams.append('langue', language);

  const res = await fetch(String(url));

  if (res.redirected) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP: ${res.status} - ${res.statusText}`);
  }

  const body = await res.text();

  const $ = cheerio.load(body);
  const $detailsCol = $('#container > .row:nth-of-type(4) > .col-xs-12:nth-of-type(3)');
  const $brokerDetailsRow = $detailsCol.find('> dl.row.section-dl:nth-of-type(1)');
  const $agencyDetailsRow = $detailsCol.find('> dl.row.section-dl:nth-of-type(3)');
  
  return {
    id,
    name: $('#container > .row.hidden-xs:nth-of-type(3) > .col-xs-12:nth-of-type(1) > strong').text().trim(),
    photo: String(new URL($('.row:nth-of-type(4) > .section-dl:nth-of-type(1) > .no_print > img.img-responsive').prop('src'), baseUrl)),
    licenseNumber: $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(),
    areasOfPractice: $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(2)').text().trim().split(/(?:s*,s*)+/),
    licenseType: $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(3) > div:nth-of-type(1)').text().trim(),
    licenseTypeRemark: $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(3) > div:nth-of-type(1) > a').data('content'),
    modeOfExercise: $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(4)').text().trim(),
    modeOfExerciseRemark: RA.defaultWhen(R.isEmpty, null, $brokerDetailsRow.find('> dd.col-xs-12:nth-of-type(5)').text().trim()),
    agency: R.ifElse(R.contains(R.__, ['Agency', 'Agence']), () => ({
      id: new URL($agencyDetailsRow.find('> dd.col-xs-12:nth-of-type(1) > a').prop('href'), baseUrl).searchParams.get(idParamName),
      name: $agencyDetailsRow.find('> dd.col-xs-12:nth-of-type(1) > a').text().trim(),
      corporateName: $agencyDetailsRow.find('> dd.col-xs-12:nth-of-type(1) > a').text().trim(),
      licenseNumber: $agencyDetailsRow.find('> dd.col-xs-12:nth-of-type(2)').text().trim()
    }), R.always(null))($agencyDetailsRow.find('> dt.col-xs-12:nth-of-type(1)').text().trim()),
    assumedName: R.ifElse(R.contains(R.__, ['Assumed name', 'Nom d\'emprunt']), () => $agencyDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(), R.always(null))($agencyDetailsRow.find('> dt.col-xs-12:nth-of-type(1)').text().trim()),
    corporatePractice: R.compose(R.ifElse(R.complement(R.isNil), $row => $row.find('> dd.col-xs-12:nth-of-type(1)').text().trim(), R.always(null)), R.find($row => R.contains($row.find('> dt.col-xs-12:nth-of-type(1)').text().trim(), ['Practices within a business corporation', 'Exerce au sein d\'une société par actions'])))([$detailsCol.find('> dl.row.section-dl:nth-of-type(2)'), $detailsCol.find('> dl.row.section-dl:nth-of-type(3)')]),
    contact: R.compose(R.ifElse(R.complement(R.isNil), $contactDetailsRow => ({
      address: $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(),
      telephone: R.ifElse(R.complement(R.contains(R.__, notAvailableTexts)), R.compose(R.curryN(2, formatPhoneNumber)(R.__, 'E.164'), R.curryN(2, parsePhoneNumber)(R.__, { defaultCountry: 'CA' })), R.always(null))($contactDetailsRow.find('> dd.col-xs-12:nth-of-type(2)').text().trim()),
      fax: R.ifElse(R.complement(R.contains(R.__, notAvailableTexts)), R.compose(R.curryN(2, formatPhoneNumber)(R.__, 'E.164'), R.curryN(2, parsePhoneNumber)(R.__, { defaultCountry: 'CA' })), R.always(null))($contactDetailsRow.find('> dd.col-xs-12:nth-of-type(3)').text().trim()),
      email: RA.defaultWhen(R.contains(R.__, notAvailableTexts), null, $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(3)').text().trim()),
      website: RA.defaultWhen(R.contains(R.__, notAvailableTexts), null, $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(4)').text().trim())
    }), R.always(null)), R.find($row => R.contains($row.find('> dt.col-xs-12:nth-of-type(1)').text().trim(), ['Business address', 'Adresse professionnelle'])))([$detailsCol.find('> dl.row.section-dl:nth-of-type(5)'), $detailsCol.find('> dl.row.section-dl:nth-of-type(5)')])
  };
}

async function getAgencyDetails({
  id,
  language = 'French'
}) {
  if (R.isNil(id)) {
    throw new Error('`id` option is required please');
  }

  if (!R.contains(language)(LANGUAGES)) {
    throw new RangeError('Invalid value for `language` option');
  }

  const url = new URL(viewMemberInfoUrl, baseUrl);
  url.searchParams.append(idParamName, id);
  url.searchParams.append('langue', language);

  const res = await fetch(String(url));

  if (res.redirected) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`HTTP: ${res.status} - ${res.statusText}`);
  }

  const body = await res.text();

  const $ = cheerio.load(body);
  const $detailsCol = $('#container > .row:nth-of-type(3) > .col-xs-12:nth-of-type(1)');
  const $licenseDetailsRow = $detailsCol.find('> dl.row.section-dl:nth-of-type(1)');
  const $corporateDetailsRow = $detailsCol.find('> dl.row.section-dl:nth-of-type(2)');
  const $contactDetailsRow = $detailsCol.find('> dl.row.section-dl:nth-of-type(5)');

  return {
    id,
    name: $('#container > .row:nth-of-type(2) > .col-xs-12:nth-of-type(1) > strong').text().trim(),
    licenseNumber: $licenseDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(),
    licenseType: $licenseDetailsRow.find('> dd.col-xs-12:nth-of-type(2)').text().trim(),
    corporateName: $corporateDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(),
    executiveOfficer: {
      id: new URL($corporateDetailsRow.find('> dd.col-xs-12:nth-of-type(2) > a').prop('href'), baseUrl).searchParams.get(idParamName),
      name: $corporateDetailsRow.find('> dd.col-xs-12:nth-of-type(2) > a').text().trim()
    },
    contact: {
      address: $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(1)').text().trim(),
      telephone: R.ifElse(R.complement(R.contains(R.__, notAvailableTexts)), R.compose(R.curryN(2, formatPhoneNumber)(R.__, 'E.164'), R.curryN(2, parsePhoneNumber)(R.__, { defaultCountry: 'CA' })), R.always(null))($contactDetailsRow.find('> dd.col-xs-12:nth-of-type(2)').text().trim()),
      fax: R.ifElse(R.complement(R.contains(R.__, notAvailableTexts)), R.compose(R.curryN(2, formatPhoneNumber)(R.__, 'E.164'), R.curryN(2, parsePhoneNumber)(R.__, { defaultCountry: 'CA' })), R.always(null))($contactDetailsRow.find('> dd.col-xs-12:nth-of-type(3)').text().trim()),
      email: RA.defaultWhen(R.contains(R.__, notAvailableTexts), null, $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(4)').text().trim()),
      website: RA.defaultWhen(R.contains(R.__, notAvailableTexts), null, $contactDetailsRow.find('> dd.col-xs-12:nth-of-type(5)').text().trim())
    }
  };
}

export { AREAS_OF_PRACTICE_EN, AREAS_OF_PRACTICE_FR, getAgencyDetails, getBrokerDetails, LANGUAGES, listBrokers, REGIONS };