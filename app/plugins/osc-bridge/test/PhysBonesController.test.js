const PhysBonesController = require('../modules/PhysBonesController');

describe('PhysBonesController', () => {
  test('reports a grab animation as started after sending the grab parameter', () => {
    const oscBridge = { send: jest.fn(() => true) };
    const controller = new PhysBonesController({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      emit: jest.fn()
    }, oscBridge, null);

    const result = controller.triggerAnimation('Tail', 'grab', { duration: 1000 });

    expect(result).toBe(true);
    expect(oscBridge.send).toHaveBeenCalledWith('/avatar/physbones/Tail/IsGrabbed', 1);
    controller.destroy();
  });
});
