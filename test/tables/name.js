import assert from 'assert';
import table from '../../src/table';
import { encode } from '../../src/types';
import _name from '../../src/tables/name';
import { hex, unhex } from '../testutil';

// For testing, we need a custom function that builds name tables.
// The public name.make() API of opentype.js is hiding the complexity
// of the various historic encodings and language identification
// systems that are used in OpenType and TrueType. Instead, it emits a
// simple JavaScript dictionary keyed by IETF BCP 47 language codes,
// which is the same format that is used for HTML and XML language
// tags.  That is convenient for users of opentype.js, but it
// complicates testing.
function makeNameTable(names) {
    const t = new table.Table('name', [
        { name: 'format', type: 'USHORT', value: 0 },
        { name: 'count', type: 'USHORT', value: names.length },
        { name: 'stringOffset', type: 'USHORT', value: 6 + names.length * 12 },
    ]);
    const stringPool = [];

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const text = unhex(name[1]);
        t.fields.push({
            name: 'platformID_' + i,
            type: 'USHORT',
            value: name[2],
        });
        t.fields.push({
            name: 'encodingID_' + i,
            type: 'USHORT',
            value: name[3],
        });
        t.fields.push({
            name: 'languageID_' + i,
            type: 'USHORT',
            value: name[4],
        });
        t.fields.push({ name: 'nameID_' + i, type: 'USHORT', value: name[0] });
        t.fields.push({
            name: 'length_' + i,
            type: 'USHORT',
            value: text.byteLength,
        });
        t.fields.push({
            name: 'offset_' + i,
            type: 'USHORT',
            value: stringPool.length,
        });
        for (let j = 0; j < text.byteLength; j++) {
            stringPool.push(text.getUint8(j));
        }
    }

    t.fields.push({ name: 'strings', type: 'LITERAL', value: stringPool });

    const bytes = encode.TABLE(t);
    const data = new DataView(new ArrayBuffer(bytes.length), 0);
    for (let k = 0; k < bytes.length; k++) {
        data.setUint8(k, bytes[k]);
    }

    return data;
}

function parseNameTable(names, ltag) {
    return _name.parse(makeNameTable(names), 0, ltag);
}

function getNameRecords(names) {
    const result = [];
    const stringPool = names.fields[names.fields.length - 1];
    assert(stringPool.name === 'strings');
    for (let i = 0; i < names.fields.length; i++) {
        const field = names.fields[i];
        if (field.name.indexOf('record_') === 0) {
            const name = field.value;
            const encodedText = stringPool.value.slice(
                name.offset,
                name.offset + name.length
            );
            const plat =
                { 0: 'Uni', 1: 'Mac', 2: 'ISO', 3: 'Win' }[name.platformID] ||
                name.platormID;
            let enc;
            let lang;
            if (name.platformID === 0) {
                enc = { 3: 'UCS-2', 4: 'UTF-16' }[name.encodingID];
                lang = undefined;
            } else if (name.platformID === 1) {
                enc = { 0: 'smRoman', 28: 'smEthiopic' }[name.encodingID];
                lang = {
                    0: 'langEnglish',
                    2: 'langGerman',
                    81: 'langIndonesian',
                    143: 'langInuktitut',
                }[name.languageID];
            } else if (name.platformID === 3) {
                enc = { 1: 'UCS-2', 10: 'UCS-4' }[name.encodingID];
                lang = {
                    0x0407: 'German/Germany',
                    0x0409: 'English/US',
                    0x0411: 'Japanese/Japan',
                    0x0421: 'Indonesian/Indonesia',
                    0x045d: 'Inuktitut/Canada',
                    0x085d: 'Inuktitut-Latin/Canada',
                }[name.languageID];
            } else {
                enc = lang = undefined;
            }

            result.push(
                plat +
                    ' ' +
                    (enc || name.encodingID) +
                    ' ' +
                    (lang || name.languageID) +
                    ' N' +
                    name.nameID +
                    ' [' +
                    hex(encodedText) +
                    ']'
            );
        }
    }

    return result;
}

describe('tables/name.js', function () {
    it('can parse a naming table', function () {
        assert.deepEqual(
            parseNameTable(
                [
                    [1, '0057 0061 006C 0072 0075 0073', 3, 1, 0x0409],
                    [1, '140A 1403 1555 1585', 3, 1, 0x045d],
                    [1, '0041 0069 0076 0069 0071', 3, 1, 0x085d],
                    [1, '6D77 99AC', 3, 1, 0x0411],
                    [
                        300,
                        '42 6C 61 63 6B 20 43 6F 6E 64 65 6E 73 65 64',
                        1,
                        0,
                        0,
                    ],
                    [300, '4B 6F 79 75 20 53 DD 6B DD DF DD 6B', 1, 35, 17],
                    [300, '8F EE EB F3 F7 E5 F0 20 F2 E5 F1 E5 ED', 1, 7, 44],
                    [
                        44444,
                        '004C 0069 0070 0073 0074 0069 0063 006B 0020 D83D DC84',
                        3,
                        10,
                        0x0409,
                    ],
                ],
                undefined
            ),
            {
                fontFamily: {
                    en: 'Walrus',
                    iu: 'ᐊᐃᕕᖅ',
                    'iu-Latn': 'Aiviq',
                    ja: '海馬',
                },
                300: {
                    bg: 'Получер тесен',
                    en: 'Black Condensed',
                    tr: 'Koyu Sıkışık',
                },
                44444: {
                    en: 'Lipstick 💄',
                },
            }
        );
    });

    it('can parse a naming table which refers to an ‘ltag’ table', function () {
        const ltag = ['en', 'de', 'de-1901'];
        assert.deepEqual(
            parseNameTable(
                [
                    [1, '0057 0061 006C 0072 0075 0073', 0, 4, 0],
                    [1, '0057 0061 006C 0072 006F 0073 0073', 0, 4, 1],
                    [1, '0057 0061 006C 0072 006F 00DF', 0, 4, 2],
                    [
                        999,
                        '0057 0061 006C 0072 0075 0073 002D 0054 0068 0069 006E',
                        0,
                        4,
                        0xffff,
                    ],
                ],
                ltag
            ),
            {
                fontFamily: {
                    de: 'Walross',
                    'de-1901': 'Walroß',
                    en: 'Walrus',
                },
                999: {
                    und: 'Walrus-Thin',
                },
            }
        );
    });

    it('ignores name records for unknown platforms', function () {
        assert.deepEqual(parseNameTable([[1, '01 02', 666, 1, 1]]), {});
    });
});
