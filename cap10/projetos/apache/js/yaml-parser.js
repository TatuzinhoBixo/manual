/**
 * Minimal YAML Parser/Serializer
 * Handles common Kubernetes manifest structures without external dependencies
 * Supports: strings, numbers, booleans, arrays, objects, multi-line strings
 */

const YAML = (function() {
    'use strict';

    /**
     * Parse YAML string to JavaScript object
     * @param {string} yamlString - The YAML string to parse
     * @returns {object|array} Parsed JavaScript object
     */
    function parse(yamlString) {
        if (!yamlString || typeof yamlString !== 'string') {
            throw new Error('Invalid YAML input');
        }

        const lines = yamlString.split('\n');
        const result = [];
        let currentDoc = null;
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Skip empty lines and comments at root level
            if (line.trim() === '' || line.trim().startsWith('#')) {
                i++;
                continue;
            }

            // Document separator
            if (line.trim() === '---') {
                if (currentDoc !== null) {
                    result.push(currentDoc);
                }
                currentDoc = null;
                i++;
                continue;
            }

            // Parse the document
            const parsed = parseValue(lines, i, 0);
            currentDoc = parsed.value;
            i = parsed.nextIndex;
        }

        if (currentDoc !== null) {
            result.push(currentDoc);
        }

        // Return single document or array of documents
        return result.length === 1 ? result[0] : result;
    }

    /**
     * Parse a value starting at the given line
     */
    function parseValue(lines, startIndex, expectedIndent) {
        const line = lines[startIndex];
        if (!line) return { value: null, nextIndex: startIndex + 1 };

        const trimmed = line.trim();
        const currentIndent = getIndent(line);

        // Check for list item
        if (trimmed.startsWith('- ')) {
            return parseArray(lines, startIndex, currentIndent);
        }

        // Check for object key
        if (trimmed.includes(':')) {
            return parseObject(lines, startIndex, currentIndent);
        }

        // Scalar value
        return { value: parseScalar(trimmed), nextIndex: startIndex + 1 };
    }

    /**
     * Parse an array
     */
    function parseArray(lines, startIndex, baseIndent) {
        const result = [];
        let i = startIndex;

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                i++;
                continue;
            }

            if (trimmed === '---') break;

            const currentIndent = getIndent(line);
            if (currentIndent < baseIndent) break;
            if (currentIndent > baseIndent && !trimmed.startsWith('- ')) {
                i++;
                continue;
            }

            if (!trimmed.startsWith('- ')) break;

            // Get the value after the dash
            const afterDash = trimmed.substring(2);

            if (afterDash === '' || afterDash.startsWith('#')) {
                // Nested structure
                const nested = parseValue(lines, i + 1, currentIndent + 2);
                result.push(nested.value);
                i = nested.nextIndex;
            } else if (afterDash.includes(':')) {
                // Inline object in array
                const obj = {};
                const colonPos = afterDash.indexOf(':');
                const key = afterDash.substring(0, colonPos).trim();
                const valueStr = afterDash.substring(colonPos + 1).trim();

                if (valueStr === '' || valueStr.startsWith('#')) {
                    // Multi-line object
                    const nestedObj = parseObject(lines, i + 1, currentIndent + 2);
                    obj[key] = nestedObj.value[key] !== undefined ? nestedObj.value : nestedObj.value;

                    // Also check current line has more content
                    const inlineObj = parseInlineObject(lines, i, currentIndent + 2);
                    Object.assign(obj, inlineObj.value);
                    i = inlineObj.nextIndex;
                } else {
                    obj[key] = parseScalar(valueStr);
                    // Check for more properties at same level
                    const moreProps = parseObject(lines, i + 1, currentIndent + 2);
                    if (moreProps.value && typeof moreProps.value === 'object') {
                        Object.assign(obj, moreProps.value);
                    }
                    i = moreProps.nextIndex;
                }
                result.push(obj);
            } else {
                result.push(parseScalar(afterDash));
                i++;
            }
        }

        return { value: result, nextIndex: i };
    }

    /**
     * Parse inline object starting from array item
     */
    function parseInlineObject(lines, startIndex, baseIndent) {
        const result = {};
        let i = startIndex;

        // First, handle the current line if it's an array item with key:value
        const firstLine = lines[i];
        if (firstLine && firstLine.trim().startsWith('- ')) {
            const content = firstLine.trim().substring(2);
            if (content.includes(':')) {
                const colonPos = content.indexOf(':');
                const key = content.substring(0, colonPos).trim();
                const value = content.substring(colonPos + 1).trim();
                result[key] = parseScalar(value);
            }
            i++;
        }

        // Then parse subsequent lines at the expected indent
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                i++;
                continue;
            }

            const currentIndent = getIndent(line);
            if (currentIndent < baseIndent) break;
            if (trimmed.startsWith('- ')) break;
            if (trimmed === '---') break;

            if (trimmed.includes(':')) {
                const colonPos = trimmed.indexOf(':');
                const key = trimmed.substring(0, colonPos).trim();
                const valueStr = trimmed.substring(colonPos + 1).trim();

                if (valueStr === '' || valueStr.startsWith('#')) {
                    const nested = parseValue(lines, i + 1, currentIndent + 2);
                    result[key] = nested.value;
                    i = nested.nextIndex;
                } else {
                    result[key] = parseScalar(valueStr);
                    i++;
                }
            } else {
                i++;
            }
        }

        return { value: result, nextIndex: i };
    }

    /**
     * Parse an object
     */
    function parseObject(lines, startIndex, baseIndent) {
        const result = {};
        let i = startIndex;

        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed === '' || trimmed.startsWith('#')) {
                i++;
                continue;
            }

            if (trimmed === '---') break;

            const currentIndent = getIndent(line);
            if (currentIndent < baseIndent) break;
            if (currentIndent > baseIndent) {
                i++;
                continue;
            }

            if (!trimmed.includes(':')) {
                i++;
                continue;
            }

            const colonPos = trimmed.indexOf(':');
            const key = trimmed.substring(0, colonPos).trim();
            const valueStr = trimmed.substring(colonPos + 1).trim();

            // Check for multi-line string indicators
            if (valueStr === '|' || valueStr === '|-' || valueStr === '>') {
                const multiLine = parseMultiLineString(lines, i + 1, currentIndent + 2, valueStr === '>');
                result[key] = multiLine.value;
                i = multiLine.nextIndex;
            } else if (valueStr === '' || valueStr.startsWith('#')) {
                // Nested value
                const nested = parseValue(lines, i + 1, currentIndent + 2);
                result[key] = nested.value;
                i = nested.nextIndex;
            } else {
                result[key] = parseScalar(valueStr);
                i++;
            }
        }

        return { value: result, nextIndex: i };
    }

    /**
     * Parse multi-line string (| or >)
     */
    function parseMultiLineString(lines, startIndex, baseIndent, fold) {
        const resultLines = [];
        let i = startIndex;

        while (i < lines.length) {
            const line = lines[i];
            const currentIndent = getIndent(line);

            if (line.trim() === '') {
                resultLines.push('');
                i++;
                continue;
            }

            if (currentIndent < baseIndent) break;

            resultLines.push(line.substring(baseIndent));
            i++;
        }

        // Trim trailing empty lines
        while (resultLines.length > 0 && resultLines[resultLines.length - 1] === '') {
            resultLines.pop();
        }

        const value = fold ? resultLines.join(' ') : resultLines.join('\n');
        return { value, nextIndex: i };
    }

    /**
     * Parse a scalar value
     */
    function parseScalar(str) {
        if (!str || str === '~' || str === 'null') return null;
        if (str === 'true') return true;
        if (str === 'false') return false;

        // Quoted string
        if ((str.startsWith('"') && str.endsWith('"')) ||
            (str.startsWith("'") && str.endsWith("'"))) {
            return str.slice(1, -1);
        }

        // Number
        if (/^-?\d+$/.test(str)) return parseInt(str, 10);
        if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);

        // Remove inline comments
        const commentIndex = str.indexOf(' #');
        if (commentIndex > 0) {
            str = str.substring(0, commentIndex).trim();
        }

        return str;
    }

    /**
     * Get indentation level of a line
     */
    function getIndent(line) {
        const match = line.match(/^(\s*)/);
        return match ? match[1].length : 0;
    }

    /**
     * Serialize JavaScript object to YAML string
     * @param {object|array} obj - The object to serialize
     * @param {number} indent - Current indentation level
     * @returns {string} YAML string
     */
    function stringify(obj, indent = 0) {
        if (obj === null || obj === undefined) {
            return 'null';
        }

        if (typeof obj === 'boolean') {
            return obj ? 'true' : 'false';
        }

        if (typeof obj === 'number') {
            return String(obj);
        }

        if (typeof obj === 'string') {
            // Check if string needs quoting
            if (obj === '' ||
                obj.includes('\n') ||
                obj.includes(':') ||
                obj.includes('#') ||
                obj.startsWith(' ') ||
                obj.endsWith(' ') ||
                /^[\d\.\-]/.test(obj) ||
                ['true', 'false', 'null', 'yes', 'no'].includes(obj.toLowerCase())) {

                // Use multi-line for strings with newlines
                if (obj.includes('\n')) {
                    const spaces = '  '.repeat(indent);
                    const lines = obj.split('\n').map(l => spaces + l).join('\n');
                    return '|\n' + lines;
                }

                // Use double quotes and escape
                return '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
            }
            return obj;
        }

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '[]';

            const spaces = '  '.repeat(indent);
            const items = obj.map(item => {
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    // Object in array
                    const firstKey = Object.keys(item)[0];
                    const firstValue = item[firstKey];
                    const restKeys = Object.keys(item).slice(1);

                    let result = spaces + '- ' + firstKey + ': ';

                    if (typeof firstValue === 'object' && firstValue !== null) {
                        result += '\n' + stringifyObject(firstValue, indent + 2);
                    } else {
                        result += stringify(firstValue, indent + 2);
                    }

                    // Add remaining keys
                    for (const key of restKeys) {
                        result += '\n' + '  '.repeat(indent + 1) + key + ': ';
                        if (typeof item[key] === 'object' && item[key] !== null) {
                            result += '\n' + stringifyObject(item[key], indent + 2);
                        } else {
                            result += stringify(item[key], indent + 2);
                        }
                    }

                    return result;
                } else {
                    return spaces + '- ' + stringify(item, indent + 1);
                }
            });

            return items.join('\n');
        }

        if (typeof obj === 'object') {
            return stringifyObject(obj, indent);
        }

        return String(obj);
    }

    /**
     * Stringify an object
     */
    function stringifyObject(obj, indent) {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';

        const spaces = '  '.repeat(indent);
        const lines = keys.map(key => {
            const value = obj[key];
            let line = spaces + key + ':';

            if (value === null || value === undefined) {
                return line + ' null';
            }

            if (typeof value === 'object') {
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        return line + ' []';
                    }
                    return line + '\n' + stringify(value, indent + 1);
                } else {
                    if (Object.keys(value).length === 0) {
                        return line + ' {}';
                    }
                    return line + '\n' + stringifyObject(value, indent + 1);
                }
            }

            return line + ' ' + stringify(value, indent);
        });

        return lines.join('\n');
    }

    /**
     * Stringify multiple documents
     */
    function stringifyAll(docs) {
        if (!Array.isArray(docs)) {
            return stringify(docs);
        }
        return docs.map(doc => '---\n' + stringify(doc)).join('\n');
    }

    // Public API
    return {
        parse: parse,
        stringify: stringify,
        stringifyAll: stringifyAll
    };
})();

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = YAML;
}
