import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MEDIA, PROVIDER_MODELS } from "../../open-sse/providers/index.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { getTtsVoicesForModel } from "../../open-sse/config/ttsModels.js";
import { getImageAdapter } from "../../open-sse/handlers/imageProviders/index.js";
import { FORMAT_HANDLERS } from "../../open-sse/handlers/ttsProviders/genericFormats.js";

const HOST = "https://token-plan.ap-southeast-1.maas.aliyuncs.com";

describe("Alibaba Token Plan provider", () => {
  const entry = REGISTRY.find((e) => e.id === "alitp-intl");
  const models = PROVIDER_MODELS["alitp-intl"] || [];
  const modelById = new Map(models.map((m) => [m.id, m]));

  it("is registered as an OpenAI-compatible apikey provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(PROVIDERS["alitp-intl"]).toBeDefined();
    expect(PROVIDERS["alitp-intl"].format).toBe("openai");
  });

  it("targets the Singapore Token Plan host in compatible mode", () => {
    // eu-central-1 answers IllegalEndpoint; the plan is Singapore-only.
    expect(PROVIDERS["alitp-intl"].baseUrl).toBe(`${HOST}/compatible-mode/v1/chat/completions`);
    expect(PROVIDERS["alitp-intl"].validateUrl).toBe(`${HOST}/compatible-mode/v1/models`);
  });

  it("does not collide with the other three Alibaba key types", () => {
    const hosts = ["alicode", "alicode-intl", "alims-intl", "alitp-intl"]
      .map((id) => new URL(PROVIDERS[id].baseUrl).host);
    expect(new Set(hosts).size).toBe(hosts.length);
  });

  it("falls back to the models the plan currently serves", () => {
    expect(models.map((m) => m.id)).toEqual([
      "qwen3.8-max",
      "qwen3.8-flash",
      "qwen3.7-max",
      "qwen3.7-plus",
      "qwen3.6-flash",
      "glm-5.2",
      "deepseek-v4-pro",
      "deepseek-v4-pro-0813",
      "deepseek-v4-flash-0731",
      "wan2.7-image",
      "wan2.7-image-pro",
      "qwen-audio-3.0-tts-plus",
    ]);
  });

  it("types media models so they leave the chat list", () => {
    expect(modelById.get("wan2.7-image").kind).toBe("image");
    expect(modelById.get("wan2.7-image-pro").kind).toBe("image");
    expect(modelById.get("qwen-audio-3.0-tts-plus").kind).toBe("tts");
    expect(modelById.get("qwen3.8-max").kind).toBeUndefined();
  });

  it("declares the media kinds it can execute", () => {
    expect(PROVIDER_MEDIA["alitp-intl"].serviceKinds).toEqual(["llm", "image", "tts"]);
    expect(PROVIDER_MEDIA["alitp-intl"].imageConfig.baseUrl)
      .toBe(`${HOST}/api/v1/services/aigc/multimodal-generation/generation`);
    expect(PROVIDER_MEDIA["alitp-intl"].ttsConfig.baseUrl)
      .toBe(`${HOST}/api/v1/services/audio/tts/SpeechSynthesizer`);
  });

  it("registers an executor for every declared media kind", () => {
    expect(getImageAdapter("alitp-intl")).toBeTruthy();
    expect(FORMAT_HANDLERS[PROVIDER_MEDIA["alitp-intl"].ttsConfig.format]).toBeTypeOf("function");
    expect(getTtsVoicesForModel("alitp-intl", "qwen-audio-3.0-tts-plus").map((v) => v.id))
      .toEqual(["longanlingxin", "longanlufeng"]);
  });

  it("reports the live-verified capabilities", () => {
    expect(getCapabilitiesForModel("alitp-intl", "qwen3.8-max")).toMatchObject({
      vision: true,
      videoInput: true,
      reasoning: true,
      thinkingFormat: "openai",
      contextWindow: 1000000,
      maxOutput: 131072,
    });

    // Rejects image parts outright; the only text-only Qwen route on the plan.
    expect(getCapabilitiesForModel("alitp-intl", "qwen3.7-max")).toMatchObject({ vision: false, videoInput: false });

    // Upstream caps this one lower than the rest.
    expect(getCapabilitiesForModel("alitp-intl", "qwen3.6-flash")).toMatchObject({ vision: true, maxOutput: 65536 });

    // Reads PDFs live even though the spec page badges only Image/Text/Video.
    expect(getCapabilitiesForModel("alitp-intl", "qwen3.8-max").pdf).toBe(true);

    // Spec page: 1.04M context, 131.07K output.
    expect(getCapabilitiesForModel("alitp-intl", "glm-5.2")).toMatchObject({
      vision: false,
      audioInput: false,
      reasoning: true,
      thinkingFormat: "openai",
      contextWindow: 1048576,
      maxOutput: 131072,
    });

    // Spec pages give 393K output; upstream itself never validates the field.
    expect(getCapabilitiesForModel("alitp-intl", "deepseek-v4-pro")).toMatchObject({
      vision: false,
      audioInput: false,
      contextWindow: 1000000,
      maxOutput: 393216,
    });

    // Spec page: same 1M/393K class as v4-pro. On the plan roster though the
    // live catalog omits it.
    expect(getCapabilitiesForModel("alitp-intl", "deepseek-v4-pro-0813")).toMatchObject({
      vision: false,
      contextWindow: 1000000,
      maxOutput: 393216,
    });

    // Retired preview ID; upstream auto-routes it to the production qwen3.8-max.
    expect(getCapabilitiesForModel("alitp-intl", "qwen3.8-max-preview")).toMatchObject({
      vision: true,
      pdf: true,
      maxOutput: 131072,
    });
  });

  it("exposes each model's probed reasoning_effort levels", () => {
    const levels = {
      "qwen3.8-max": ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
      "qwen3.8-flash": ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
      "qwen3.7-max": ["none", "minimal", "low", "medium", "high", "xhigh"],
      "qwen3.7-plus": ["none", "minimal", "low", "medium", "high", "xhigh"],
      "qwen3.6-flash": ["none", "minimal", "low", "medium", "high", "xhigh"],
      "glm-5.2": ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
      "deepseek-v4-pro": ["low", "medium", "high", "xhigh", "max"],
      "deepseek-v4-pro-0813": ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
      "deepseek-v4-flash-0731": ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
    };
    for (const [id, expected] of Object.entries(levels)) {
      expect(getThinkingLevels("alitp-intl", id)).toEqual(expected);
    }
  });

  it("clamps unsupported levels to each model's enum", () => {
    const apply = (model, intent, credentials) => {
      const body = {};
      applyThinking(FORMATS.OPENAI, model, body, "alitp-intl", intent, credentials);
      return body.reasoning_effort;
    };
    const none = { mode: "none" };
    const max = { mode: "level", level: "max" };
    const ultra = { mode: "level", level: "ultra" };
    expect(apply("deepseek-v4-pro", none)).toBe("low");
    expect(apply("qwen3.7-max", max)).toBe("xhigh");
    expect(apply("qwen3.8-max", max)).toBe("max");
    expect(apply("qwen3.8-max", ultra)).toBe("max");
    expect(apply("qwen3.7-max", ultra)).toBe("xhigh");
  });

  it("normalizes thinking per transport surface", () => {
    const intent = { mode: "level", level: "high" };
    const openaiBody = {};
    applyThinking(FORMATS.OPENAI, "qwen3.8-max", openaiBody, "alitp-intl", intent);
    expect(openaiBody.reasoning_effort).toBe("high");
    expect(openaiBody.thinking).toBeUndefined();
    // A claude-format target always rides the claude transport (default surface
    // is openai), so its transport-level claude-budget format applies.
    const claudeBody = {};
    applyThinking(FORMATS.CLAUDE, "qwen3.8-max", claudeBody, "alitp-intl", intent, {
      runtimeTransport: { format: "claude", thinkingFormat: "claude-budget" },
    });
    expect(claudeBody.thinking).toMatchObject({ type: "enabled" });
    expect(claudeBody.thinking.budget_tokens).toBeGreaterThan(0);
    expect(claudeBody.reasoning_effort).toBeUndefined();
    // none on a cannot-disable model → minimal thinking at the Anthropic floor.
    const offBody = {};
    applyThinking(FORMATS.CLAUDE, "deepseek-v4-pro", offBody, "alitp-intl", { mode: "none" }, {
      runtimeTransport: { format: "claude", thinkingFormat: "claude-budget" },
    });
    expect(offBody.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
  });

  it("claims web search on every chat model (Responses surface)", () => {
    // web_search executes on /responses for all 8 (forced tool_choice, count >= 1);
    // chat completions enable_search is a silent no-op, and glm-5.2 rejects the field.
    for (const id of ["qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "qwen3.7-plus", "qwen3.6-flash", "glm-5.2", "deepseek-v4-pro", "deepseek-v4-flash-0731"]) {
      expect(getCapabilitiesForModel("alitp-intl", id).search).toBe(true);
    }
  });

  it("keeps tool calling on for every chat model and off for the media models", () => {
    const chatModels = models.filter((m) => !m.kind).map((m) => m.id);
    expect(chatModels).toHaveLength(9);
    for (const id of chatModels) {
      expect(getCapabilitiesForModel("alitp-intl", id).tools).toBe(true);
    }

    for (const id of ["wan2.7-image", "wan2.7-image-pro", "qwen-audio-3.0-tts-plus"]) {
      expect(getCapabilitiesForModel("alitp-intl", id).tools).toBe(false);
    }
  });

  it("surfaces output modalities for both image models and the speech model", () => {
    expect(getCapabilitiesForModel("alitp-intl", "wan2.7-image")).toMatchObject({ imageOutput: true });
    expect(getCapabilitiesForModel("alitp-intl", "wan2.7-image-pro")).toMatchObject({ imageOutput: true });
    expect(getCapabilitiesForModel("alitp-intl", "qwen-audio-3.0-tts-plus")).toMatchObject({ audioOutput: true });
  });

  it("keeps every registry id unique after adding the provider", () => {
    const ids = REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("exposes one transport per client format", () => {
    const entry = REGISTRY.find((e) => e.id === "alitp-intl");
    expect(entry.transports.map((t) => t.format)).toEqual(["openai-responses", "claude"]);

    const responses = entry.transports.find((t) => t.format === "openai-responses");
    expect(responses.baseUrl).toContain("/compatible-mode/v1/responses");

    const claude = entry.transports.find((t) => t.format === "claude");
    expect(claude.baseUrl).toContain("/apps/anthropic/v1/messages");
    expect(claude.auth).toMatchObject({ header: "x-api-key", scheme: "raw", anthropicVersion: true });
    expect(claude.thinkingFormat).toBe("claude-budget");
  });
});
