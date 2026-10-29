// Данные и тексты создаются из example.yml; ниже только проверка доступа.
import {sourceExample, sourceScenarios} from './data.mjs';
export const example = sourceExample;
export const scenarios = sourceScenarios;

const supportedModels = ['dac', 'rbac', 'mac'];
const supportedOperations = ['read', 'write', 'edit', 'copy'];

export function normaliseState(model, state = {}) {
  if (!supportedModels.includes(model)) throw new RangeError(message('unknownModel', { model }));
  const input = state && typeof state === 'object' ? state : {};
  const subject = Object.hasOwn(example.subjects, input.subject) ? input.subject : 'boris';
  const object = Object.hasOwn(example.objects, input.object) ? input.object : 'handout';
  const processLevel = Number(input.processLevel ?? example.subjects[subject].level);
  return {
    ...input,
    subject,
    object,
    operation: supportedOperations.includes(input.operation) ? input.operation : 'read',
    processLevel: [1, 2, 3].includes(processLevel) ? processLevel : example.subjects[subject].level,
    granted: input.granted === true,
    overview: input.overview === true,
  };
}

function permissionFor(model, state, object, right) {
  if (model === 'dac') {
    const direct = example.dac.rights[state.subject][object];
    const extra = state.granted && state.subject === example.grant.subject
      && object === example.grant.object && example.grant.rights.includes(right);
    return direct.includes(right) || extra;
  }
  return Object.entries(example.roles).some(([roleId, role]) => {
    const assigned = role.subjects.includes(state.subject)
      || (state.granted && state.subject === example.grant.subject && roleId === example.grant.role);
    return assigned && role.permissions.some(permission => permission.object === object && permission.rights.includes(right));
  });
}

function message(key, values = {}) {
  return example.messages[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

function checkMac(state) {
  const process = state.processLevel;
  const object = example.objects[state.object];
  const values = { process, file: object.file, level: object.level };
  if (state.operation === 'copy') {
    const source = example.objects[example.copy.source];
    const target = example.objects[example.copy.target];
    Object.assign(values, { source: source.file, sourceLevel: source.level, target: target.file, targetLevel: target.level });
    if (source.level > process) return { allowed: false, reason: message('copyReadDenied', values) };
    if (target.level < process) return { allowed: false, reason: message('copyWriteDenied', values) };
    return { allowed: true, reason: message('copyAllowed', values) };
  }
  const allowed = state.operation === 'read' ? object.level <= process
    : state.operation === 'write' ? object.level >= process : object.level === process;
  return { allowed, reason: message(`${state.operation}${allowed ? 'Allowed' : 'Denied'}`, values) };
}

export function evaluateAccess(model, state = {}) {
  const current = normaliseState(model, state);
  if (model === 'mac') return checkMac(current);
  const requests = current.operation === 'copy'
    ? [{ object: example.copy.source, right: 'R' }, { object: example.copy.target, right: 'W' }]
    : (current.operation === 'edit' ? ['R', 'W'] : [current.operation === 'read' ? 'R' : 'W'])
      .map(right => ({ object: current.object, right }));
  const allowed = requests.every(request => permissionFor(model, current, request.object, request.right));
  const values = {
    subject: example.subjects[current.subject].label,
    requested: requests.map(request => message('permissionRequest', { right: request.right, file: example.objects[request.object].file })).join(example.messages.permissionJoin),
    basis: example.messages[model === 'dac' ? 'dacBasis' : 'rbacBasis'],
  };
  const suffix = allowed && current.operation === 'copy' ? example.messages.copyPermissionSuffix : '';
  return { allowed, reason: message(allowed ? 'permissionAllowed' : 'permissionDenied', values) + suffix };
}
