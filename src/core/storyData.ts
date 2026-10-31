// The two campaigns' stories (data/story/*.json): "Mạch Nguồn" (Việt Nam Odyssey) and "Quần Đảo Khởi Nguyên"
// (Phiêu lưu). Their quests join the campaign's quest book; their NPCs / trainers join the maps (map/regionDefs.ts).
import vietnamStory from '../data/story/vietnam.json';
import classicStory from '../data/story/classic.json';
import type { StoryDef } from './story';

export const STORIES: Record<'classic' | 'vietnam', StoryDef> = {
  vietnam: vietnamStory as unknown as StoryDef,
  classic: classicStory as unknown as StoryDef,
};

export function storyOf(campaign: string | undefined): StoryDef {
  return campaign === 'vietnam' ? STORIES.vietnam : STORIES.classic;
}
