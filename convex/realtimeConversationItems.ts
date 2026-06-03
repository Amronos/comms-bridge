import { v } from 'convex/values';
import type { Infer } from 'convex/values';

const realtimeInputTextContentValidator = v.object({
	type: v.literal('input_text'),
	text: v.string()
});

const realtimeInputAudioContentValidator = v.object({
	type: v.literal('input_audio'),
	audio: v.optional(v.union(v.string(), v.null())),
	transcript: v.union(v.string(), v.null())
});

const realtimeOutputTextContentValidator = v.object({
	type: v.literal('output_text'),
	text: v.string()
});

const realtimeOutputAudioContentValidator = v.object({
	type: v.literal('output_audio'),
	audio: v.optional(v.union(v.string(), v.null())),
	transcript: v.optional(v.union(v.string(), v.null()))
});

const realtimeSystemMessageItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.literal('message'),
	role: v.literal('system'),
	content: v.array(realtimeInputTextContentValidator)
});

const realtimeUserMessageItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.literal('message'),
	role: v.literal('user'),
	status: v.union(v.literal('in_progress'), v.literal('completed')),
	content: v.array(v.union(realtimeInputTextContentValidator, realtimeInputAudioContentValidator))
});

const realtimeAssistantMessageItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.literal('message'),
	role: v.literal('assistant'),
	status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('incomplete')),
	content: v.array(v.union(realtimeOutputTextContentValidator, realtimeOutputAudioContentValidator))
});

const realtimeToolCallItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.literal('function_call'),
	status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('incomplete')),
	arguments: v.string(),
	name: v.string(),
	output: v.union(v.string(), v.null())
});

const realtimeMcpCallItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.union(v.literal('mcp_call'), v.literal('mcp_tool_call')),
	status: v.union(v.literal('in_progress'), v.literal('completed'), v.literal('incomplete')),
	arguments: v.string(),
	name: v.string(),
	output: v.union(v.string(), v.null())
});

const realtimeMcpApprovalRequestItemValidator = v.object({
	itemId: v.string(),
	previousItemId: v.optional(v.union(v.string(), v.null())),
	type: v.literal('mcp_approval_request'),
	serverLabel: v.string(),
	name: v.string(),
	arguments: v.record(v.string(), v.any()),
	approved: v.optional(v.union(v.boolean(), v.null()))
});

export const realtimeConversationItemValidator = v.union(
	realtimeSystemMessageItemValidator,
	realtimeUserMessageItemValidator,
	realtimeAssistantMessageItemValidator,
	realtimeToolCallItemValidator,
	realtimeMcpCallItemValidator,
	realtimeMcpApprovalRequestItemValidator
);

export type RealtimeConversationItem = Infer<typeof realtimeConversationItemValidator>;
