import type Phaser from 'phaser';
import { creatureFootAnchor, sheetKey } from './animation';
import { pmdReady, pmdSheetKey } from './pmdPack';
import { fieldScale } from './spriteRegistry';
import { groundPose, pmdFootAnchor, visualProfile } from './overworldVisual';

/** Scene-owned silhouettes and rescue decorations use the same geometry as live units. */
export function createGroundSprite(scene: Phaser.Scene, species: string, x: number, y: number) {
  const id = species.replace('~shiny', ''), shiny = species.endsWith('~shiny');
  const pmd = pmdReady(id, shiny);
  const key = pmd ? pmdSheetKey(id, shiny, 'Idle') : sheetKey(species);
  const sprite = scene.add.sprite(x, y, key, 0);
  const profile = visualProfile(id, pmd, fieldScale(species));
  if (pmd) {
    const a = pmdFootAnchor(id, 0, sprite.frame.realWidth, sprite.frame.realHeight, profile);
    sprite.setOrigin(a.x / sprite.frame.realWidth, a.y / sprite.frame.realHeight);
  } else {
    const a = creatureFootAnchor(species);
    sprite.setOrigin(a.x, a.y);
  }
  const pose = groundPose(x, y, profile);
  return sprite.setPosition(pose.x, pose.y).setDepth(y).setScale(profile.visualScale);
}
