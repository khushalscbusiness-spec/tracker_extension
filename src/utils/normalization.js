// src/utils/normalization.js
export class NormalizationUtils {
  normalize(job) {
    if (!job) return null;

    return {
      title: this.normalizeTitle(job.title || ''),
      company: this.normalizeCompany(job.company || ''),
      location: this.normalizeLocation(job.location || ''),
      url: this.normalizeUrl(job.url || ''),
      platform: job.platform || 'generic',
      externalJobId: job.externalJobId || null,
      fingerprint: this.generateFingerprint(job)
    };
  }

  normalizeTitle(title) {
    if (!title) return '';

    return title
      .trim()
      // Remove common suffixes
      .replace(/\s*[-|:]\s*(Junior|Senior|Lead|Principal|Staff|Engineer|Developer|Manager)\s*$/i, '')
      // Remove location suffixes
      .replace(/\s*\([^)]*\)\s*$/, '')
      // Remove salary ranges
      .replace(/\s*[$£€][\d,.]+\s*[-–]\s*[$£€][\d,.]+/, '')
      .replace(/\s*[$£€][\d,.]+[kK]\s*/, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeCompany(company) {
    if (!company) return '';

    return company
      .trim()
      // Remove common legal suffixes
      .replace(/\b(Inc|LLC|Ltd|Limited|Corp|Corporation|Technologies|Tech|Systems|Solutions|Group|Holdings|International)\b\.?$/i, '')
      .replace(/\b(INC|LLC|LTD|LIMITED|CORP|CORPORATION|TECHNOLOGIES|TECH|SYSTEMS|SOLUTIONS|GROUP|HOLDINGS|INTERNATIONAL)\b\.?$/i, '')
      // Remove punctuation
      .replace(/[.,]/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeLocation(location) {
    if (!location) return '';

    return location
      .trim()
      // Remove "Remote" and similar
      .replace(/\b(Remote|On-site|Hybrid|Work from Home|WFH)\b/gi, '')
      // Remove country codes
      .replace(/\b(USA|US|UK|IND|India|USA)\b/gi, '')
      // Remove postal codes
      .replace(/\b\d{5}(?:-\d{4})?\b/, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .replace(/\s*,\s*/g, ', ')
      .trim();
  }

  normalizeUrl(url) {
    if (!url) return '';

    try {
      const urlObj = new URL(url);

      // Remove tracking parameters
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign',
        'utm_term', 'utm_content', 'ref', 'source',
        'si', 'tracking', 'affiliate'
      ];

      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Remove trailing slash
      let normalized = urlObj.toString();
      normalized = normalized.replace(/\/$/, '');

      return normalized;
    } catch (e) {
      return url;
    }
  }

  generateFingerprint(job) {
    if (!job) return null;

    // If we have external job ID, use it as primary fingerprint
    if (job.externalJobId && job.platform) {
      const data = `${job.platform}:${job.externalJobId}`;
      return this.hashString(data);
    }

    // Otherwise use company + title + location
    const data = [
      this.normalizeCompany(job.company || ''),
      this.normalizeTitle(job.title || ''),
      this.normalizeLocation(job.location || '')
    ].filter(Boolean).join('|');

    return data ? this.hashString(data) : null;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Utility to check if two jobs are likely the same
  areSimilar(job1, job2) {
    if (!job1 || !job2) return false;

    // Compare fingerprints first
    if (job1.fingerprint && job2.fingerprint) {
      return job1.fingerprint === job2.fingerprint;
    }

    // Fallback to heuristic matching
    const titleMatch = this.areStringsSimilar(job1.title, job2.title);
    const companyMatch = this.areStringsSimilar(job1.company, job2.company);
    const locationMatch = this.areStringsSimilar(job1.location, job2.location);

    return titleMatch && companyMatch && locationMatch;
  }

  areStringsSimilar(str1, str2) {
    if (!str1 || !str2) return false;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return true;

    // Partial match (one contains the other)
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Token match (significant overlap)
    const tokens1 = s1.split(/\s+/);
    const tokens2 = s2.split(/\s+/);
    const commonTokens = tokens1.filter(t => tokens2.includes(t));
    const threshold = Math.min(tokens1.length, tokens2.length) * 0.6;

    return commonTokens.length >= threshold;
  }
}

export const NORMALIZATION = new NormalizationUtils();