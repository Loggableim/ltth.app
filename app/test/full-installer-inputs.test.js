const path = require('path');
const { spawnSync } = require('child_process');

test('separate full installer declared-input manifest and Windows lock fixtures', () => {
  const choices = [['python3'], ['python'], ['py', '-3']];
  const python = choices.find(command => spawnSync(command[0], [...command.slice(1), '--version']).status === 0);
  expect(python).toBeDefined();
  const result = spawnSync(python[0], [...python.slice(1), '-B', path.resolve(__dirname, '../../scripts/test_full_installer_inputs.py'), '-v'], { encoding: 'utf8' });
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: expect.stringContaining('OK') });
});
