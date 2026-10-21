// 평소 혼잡도 프로필. 원본: data/static/congestion-profile.json (scripts/build-congestion-profile.mjs)
import type { CongestionProfile } from '@bus-s/core';
import profileJson from '../../../data/static/congestion-profile.json';

export const congestionProfile = profileJson as CongestionProfile;
