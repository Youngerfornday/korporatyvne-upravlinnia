import { element, emptyElement, serializeXml, textElement } from '../xml.ts';

/**
 * `imsmanifest.xml` пакета SCORM 1.2 (IMS Content Packaging 1.1.2 + розширення ADL): одна організація,
 * один пункт з прохідним балом і один ресурс-SCO з переліком усіх файлів пакета. Moodle 5.2 читає саме цю
 * структуру (mod/scorm/datamodels/scormlib.php): organization → item → identifierref → resource.
 */

export const MANIFEST_FILE = 'imsmanifest.xml';
export const LAUNCH_FILE = 'index.html';

const NAMESPACES = {
  xmlns: 'http://www.imsproject.org/xsd/imscp_rootv1p1p2',
  'xmlns:adlcp': 'http://www.adlnet.org/xsd/adlcp_rootv1p2',
  'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  'xsi:schemaLocation':
    'http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd',
} as const;

const IDENTIFIER = /^[a-z0-9][a-z0-9-]*$/;
const FILE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export interface ScormManifestInput {
  /** Латиниця, цифри, дефіс: основа ідентифікаторів маніфесту. */
  readonly id: string;
  readonly title: string;
  readonly organizationTitle: string;
  /** 0..100, ціле або з десятковою частиною. */
  readonly masteryPercent: number;
  /** Усі файли пакета відносно кореня архіву, крім самого маніфесту. */
  readonly files: readonly string[];
}

function assertInput(input: ScormManifestInput): void {
  if (!IDENTIFIER.test(input.id)) throw new Error(`Некоректний ID пакета SCORM «${input.id}»`);
  if (!(input.masteryPercent >= 0 && input.masteryPercent <= 100)) throw new Error(`Прохідний бал ${input.masteryPercent} поза межами 0..100`);
  if (!input.files.includes(LAUNCH_FILE)) throw new Error(`Пакет ${input.id} не містить ${LAUNCH_FILE}`);
  const bad = input.files.find((file) => !FILE_PATH.test(file) || file.split('/').includes('..') || file === MANIFEST_FILE);
  if (bad !== undefined) throw new Error(`Некоректний шлях файлу пакета «${bad}»`);
}

export function scormManifestXml(input: ScormManifestInput): string {
  assertInput(input);
  const organization = `${input.id}-org`;
  const resource = `${input.id}-sco`;
  const files = [...new Set(input.files)].sort((a, b) => (a === LAUNCH_FILE ? -1 : b === LAUNCH_FILE ? 1 : a.localeCompare(b)));
  const root = element(
    'manifest',
    [
      element('metadata', [textElement('schema', 'ADL SCORM'), textElement('schemaversion', '1.2')]),
      element(
        'organizations',
        [
          element(
            'organization',
            [
              textElement('title', input.organizationTitle),
              element('item', [textElement('title', input.title), textElement('adlcp:masteryscore', String(input.masteryPercent))], {
                identifier: `${input.id}-item`,
                identifierref: resource,
                isvisible: 'true',
              }),
            ],
            { identifier: organization },
          ),
        ],
        { default: organization },
      ),
      element(
        'resources',
        [
          element(
            'resource',
            files.map((file) => emptyElement('file', { href: file })),
            { identifier: resource, type: 'webcontent', 'adlcp:scormtype': 'sco', href: LAUNCH_FILE },
          ),
        ],
      ),
    ],
    { identifier: `ku-scorm-${input.id}`, version: '1.0', ...NAMESPACES },
  );
  return serializeXml(root);
}
