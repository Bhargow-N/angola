import { SocialTagItem } from '../types';

export interface SocialPost {
  id: string;
  date: string;
  caption: string;
  hashtags: string[];
  location: string;
  image_description: string;
}

export interface DemoSocialProfile {
  handle: string;
  display_name: string;
  platform: 'instagram' | 'facebook';
  posts: SocialPost[];
}

export interface SocialSourceAdapter {
  fetchProfile(platform: string, handle: string): Promise<DemoSocialProfile>;
}

export class DemoAdapter implements SocialSourceAdapter {
  async fetchProfile(_platform: string, handle: string): Promise<DemoSocialProfile> {
    const cleanHandle = handle.replace(/^@/, '').trim().toLowerCase();
    const url = `/demo-social/${cleanHandle}.json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Demo profile @${cleanHandle} not found. Available demo profiles: thomas_mateus_demo, maria_candida_demo, joao_demo`);
    }
    const data = await response.json();
    return data as DemoSocialProfile;
  }
}

export class LiveAdapter implements SocialSourceAdapter {
  async fetchProfile(_platform: string, _handle: string): Promise<DemoSocialProfile> {
    throw new Error('Not enabled: needs the platform\'s official API and Unitel legal approval');
  }
}

export const socialAdapterInstance: SocialSourceAdapter = new DemoAdapter();

/**
 * Keyword fallback tag extractor for when AI key is absent or Built-in Templates mode is selected
 */
export function extractSocialTagsKeywordFallback(profile: DemoSocialProfile): SocialTagItem[] {
  const tags: SocialTagItem[] = [];
  const posts = profile.posts || [];

  // 1. Two-Wheeler (moto, bike, honda, yamaha, motociclo, motorizada)
  const twoWheelerPosts = posts.filter(p => {
    const text = `${p.caption} ${(p.hashtags || []).join(' ')} ${p.image_description}`.toLowerCase();
    return /moto|bike|honda|yamaha|motociclo|motorizada/.test(text);
  });
  if (twoWheelerPosts.length > 0) {
    tags.push({
      id: `tag-tw-${Date.now()}-1`,
      tag: 'two_wheeler',
      label: 'Two-Wheeler (Motorbike)',
      bonus_points: 1,
      evidence_post_ids: twoWheelerPosts.map(p => p.id),
      reason: `Detected active motorbike use across ${twoWheelerPosts.length} post(s) (${twoWheelerPosts.map(p => p.id).join(', ')}).`,
      confidence: 0.92,
      status: 'pending',
    });
  }

  // 2. Small Business (loja, armazem, negocio, comercio, estoque, mercadoria, oficina)
  const smallBusinessPosts = posts.filter(p => {
    const text = `${p.caption} ${(p.hashtags || []).join(' ')} ${p.image_description}`.toLowerCase();
    return /loja|armazem|negocio|comercio|estoque|mercadoria|oficina/.test(text);
  });
  if (smallBusinessPosts.length > 0) {
    tags.push({
      id: `tag-sb-${Date.now()}-2`,
      tag: 'small_business',
      label: 'Small Business Operation',
      bonus_points: 1,
      evidence_post_ids: smallBusinessPosts.map(p => p.id),
      reason: `Identified commercial inventory or retail storefront activity in post(s) (${smallBusinessPosts.map(p => p.id).join(', ')}).`,
      confidence: 0.88,
      status: 'pending',
    });
  }

  // 3. Four-Wheeler (carro, viatura, toyota, veiculo, automovel)
  const fourWheelerPosts = posts.filter(p => {
    const text = `${p.caption} ${(p.hashtags || []).join(' ')} ${p.image_description}`.toLowerCase();
    return /carro|viatura|toyota|veiculo|automovel/.test(text);
  });
  if (fourWheelerPosts.length > 0) {
    // If blurry or low light (like joao_demo), lower confidence
    const isBlurry = fourWheelerPosts.some(p => p.image_description.toLowerCase().includes('blurry') || p.image_description.toLowerCase().includes('poor resolution'));
    tags.push({
      id: `tag-fw-${Date.now()}-3`,
      tag: 'four_wheeler',
      label: 'Four-Wheeler (Passenger Car)',
      bonus_points: 2,
      evidence_post_ids: fourWheelerPosts.map(p => p.id),
      reason: isBlurry 
        ? `Partial distant vehicle observed in post(s) (${fourWheelerPosts.map(p => p.id).join(', ')}), but visual resolution is low.`
        : `Vehicle ownership indicators observed in post(s) (${fourWheelerPosts.map(p => p.id).join(', ')}).`,
      confidence: isBlurry ? 0.35 : 0.85,
      status: 'pending',
    });
  }

  // 4. Property (casa, terreno, obra, imovel, vivenda)
  const propertyPosts = posts.filter(p => {
    const text = `${p.caption} ${(p.hashtags || []).join(' ')} ${p.image_description}`.toLowerCase();
    return /casa|terreno|obra|imovel|vivenda/.test(text);
  });
  if (propertyPosts.length > 0) {
    tags.push({
      id: `tag-pr-${Date.now()}-4`,
      tag: 'property',
      label: 'Real Estate / Residential Property',
      bonus_points: 2,
      evidence_post_ids: propertyPosts.map(p => p.id),
      reason: `Residential property or construction evidence found in post(s) (${propertyPosts.map(p => p.id).join(', ')}).`,
      confidence: 0.80,
      status: 'pending',
    });
  }

  return tags;
}
