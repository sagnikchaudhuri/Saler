import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useUnloadGuard } from './useUnloadGuard';

function Harness({ active }: { active: boolean }) {
  useUnloadGuard(active);
  return null;
}

describe('useUnloadGuard', () => {
  let add: ReturnType<typeof vi.spyOn>;
  let remove: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    add = vi.spyOn(window, 'addEventListener');
    remove = vi.spyOn(window, 'removeEventListener');
  });
  afterEach(() => vi.restoreAllMocks());

  const beforeunloadAdds = () => add.mock.calls.filter((c) => c[0] === 'beforeunload').length;
  const beforeunloadRemoves = () => remove.mock.calls.filter((c) => c[0] === 'beforeunload').length;

  it('installs the guard when a meaningful call is active', () => {
    render(<Harness active />);
    expect(beforeunloadAdds()).toBe(1);
  });

  it('installs nothing while idle', () => {
    render(<Harness active={false} />);
    expect(beforeunloadAdds()).toBe(0);
  });

  it('removes the guard when the call is no longer active (e.g. completed)', () => {
    const { rerender } = render(<Harness active />);
    expect(beforeunloadAdds()).toBe(1);
    rerender(<Harness active={false} />);
    expect(beforeunloadRemoves()).toBe(1);
  });

  it('removes the guard on unmount', () => {
    const { unmount } = render(<Harness active />);
    unmount();
    expect(beforeunloadRemoves()).toBe(1);
  });

  it('the handler requests the native prompt via preventDefault', () => {
    render(<Harness active />);
    const handler = add.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as EventListener;
    const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    const prevent = vi.spyOn(e, 'preventDefault');
    handler(e);
    // preventDefault is the modern trigger for the browser's confirmation
    // dialog. (returnValue is also set for legacy engines, but jsdom models it
    // as a boolean, so we don't assert its value here.)
    expect(prevent).toHaveBeenCalled();
  });
});
