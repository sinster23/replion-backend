// backend/src/services/ai.service.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIResponseContext {
  commentText: string;
  postCaption?: string;
  userName: string;
  userPrompt?: string;
  previousComments?: string[];
}

export class AIService {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  /**
   * Generate AI response to a comment
   */
  async generateCommentReply(context: AIResponseContext): Promise<string> {
    try {
      const systemContext = `You are a helpful social media assistant responding to Instagram comments on behalf of the account owner. Your responses should be:
- Friendly and engaging
- Brief (1-2 sentences max)
- Professional yet conversational
- Relevant to the comment
- Natural and human-like`;

      const userPromptText = context.userPrompt 
        ? `Additional context: ${context.userPrompt}\n\n`
        : '';

      const postContext = context.postCaption
        ? `Post caption: "${context.postCaption}"\n\n`
        : '';

      const previousContext = context.previousComments && context.previousComments.length > 0
        ? `Previous comments on this post:\n${context.previousComments.join('\n')}\n\n`
        : '';

      const prompt = `${systemContext}

${userPromptText}${postContext}${previousContext}Generate a reply to this comment from ${context.userName}: "${context.commentText}"

Reply:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text.trim();
    } catch (error) {
      console.error('AI generation error:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Generate AI response for DM
   */
  async generateDMReply(
    dmText: string,
    userName: string,
    conversationHistory?: string[],
    customPrompt?: string
  ): Promise<string> {
    try {
      const systemContext = `You are a helpful Instagram DM assistant. Your responses should be:
- Helpful and informative
- Brief and concise
- Professional yet friendly
- Natural conversational tone`;

      const historyContext = conversationHistory && conversationHistory.length > 0
        ? `Conversation history:\n${conversationHistory.join('\n')}\n\n`
        : '';

      const promptContext = customPrompt 
        ? `Additional guidelines: ${customPrompt}\n\n`
        : '';

      const prompt = `${systemContext}

${promptContext}${historyContext}Generate a reply to this DM from ${userName}: "${dmText}"

Reply:`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text.trim();
    } catch (error) {
      console.error('AI DM generation error:', error);
      throw new Error('Failed to generate AI DM response');
    }
  }

  /**
   * Check if user has access to AI features
   */
  isAIEnabled(userPlan: string): boolean {
    return ['PRO', 'ENTERPRISE'].includes(userPlan);
  }
}

export const aiService = new AIService();