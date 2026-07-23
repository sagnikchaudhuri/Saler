import { describe, it, expect } from 'vitest';
import { createConversationProvider } from './provider';
import { LLMConversationProvider } from './LLMConversationProvider';
import { ProviderUnavailableError } from './errors';

describe('provider switching', () => {
  it('falls back to the Demo provider when no LLM is configured', () => {
    const { provider, demoMode } = createConversationProvider();
    expect(demoMode).toBe(true);
    expect(provider.getName()).toMatch(/demo/i);
    expect(provider.isAvailable()).toBe(true);
  });

  it('selects the AI customer only when enabled AND an endpoint is set', () => {
    const { provider, demoMode } = createConversationProvider({
      llmEnabled: true,
      llmEndpoint: '/api/conversation',
    });
    expect(demoMode).toBe(false);
    // The factory returns the fallback composite, which reports the AI
    // customer until a turn actually falls back to the scripted persona.
    expect(provider.getName()).toMatch(/ai customer/i);
    expect(provider.isAvailable()).toBe(true);
  });

  it('does not select the LLM provider when only the flag is set', () => {
    const { demoMode } = createConversationProvider({ llmEnabled: true });
    expect(demoMode).toBe(true);
  });
});

describe('LLMConversationProvider', () => {
  it('is disabled by default and throws ProviderUnavailableError when called', async () => {
    const llm = new LLMConversationProvider();
    expect(llm.isAvailable()).toBe(false);
    await expect(
      llm.generateReply({
        scenarioId: 't',
        transcript: [],
        memory: {
          sellerTurns: 0,
          receptiveness: 30,
          facts: [],
          askedAboutProcess: false,
          quantifiedValue: false,
          addressedObjections: [],
        },
        stage: 'opening',
        objectionsRaised: [],
        sellerMessage: 'hi',
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
