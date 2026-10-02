import { describe, expect, it, vi } from 'vitest';

import {
  liaProactiveShownKey,
  playLiaMessageSound,
  proactiveBalloonCopy,
  proactiveBatchSignature,
  shouldManifestProactiveBatch,
  visibleUnreadCount,
} from '../src/components/consultant/consultant-proactive-manifest';

describe('manifestação proativa', () => {
  it('escolhe o texto curto conforme a quantidade', () => {
    expect(proactiveBalloonCopy(1)).toBe('A Lia tem algo novo para te contar.');
    expect(proactiveBalloonCopy(3)).toBe('Identifiquei 3 situações que merecem sua atenção.');
    expect(visibleUnreadCount(3)).toBe('3');
    expect(visibleUnreadCount(12)).toBe('9+');
  });

  it('mostra o lote uma vez na sessão e libera um lote novo', () => {
    const first = proactiveBatchSignature(['b', 'a']);
    const key = liaProactiveShownKey('user-1', 'tenant-1');
    expect(key).toBe('lia-proactive-shown:user-1:tenant-1');
    expect(liaProactiveShownKey('user-1', 'tenant-2')).not.toBe(key);
    expect(shouldManifestProactiveBatch({ count: 0, signature: first, alreadyShown: null })).toBe(false);
    expect(shouldManifestProactiveBatch({ count: 2, signature: first, alreadyShown: null })).toBe(true);
    expect(shouldManifestProactiveBatch({ count: 2, signature: first, alreadyShown: first })).toBe(false);
    expect(
      shouldManifestProactiveBatch({
        count: 3,
        signature: proactiveBatchSignature(['a', 'b', 'c']),
        alreadyShown: first,
      }),
    ).toBe(true);
  });

  it('ignora autoplay bloqueado', () => {
    const play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        play = play;
      },
    );
    expect(() => playLiaMessageSound()).not.toThrow();
    expect(play).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
