/**
 * Segmentation Profiles
 * 
 * Defines the target audience segments for campaigns.
 */

export interface DemographicConstraint {
    minAge?: number;
    maxAge?: number;
    genders?: ('MALE' | 'FEMALE' | 'ALL')[];
    locations?: string[]; // Geo IDs or names
}

export interface SegmentationProfile {
    id: string;
    name: string;
    description: string;

    demographics: DemographicConstraint;
    interests: string[]; // List of interest keywords
    exclusions: string[];

    version: string;
}

export const YoungProfessionalsProfile: SegmentationProfile = {
    id: 'seg-young-pros-v1',
    name: 'Young Professionals (Merida)',
    description: 'Targeting 25-40 year olds in Merida area interested in investment.',
    demographics: {
        minAge: 25,
        maxAge: 40,
        genders: ['ALL'],
        locations: ['Merida, Yucatan', 'Mexico City'] // Simplified
    },
    interests: ['Real Estate Investing', 'Financial Independence', 'Startups'],
    exclusions: ['Real Estate Agents'],
    version: '1.0.0'
};
