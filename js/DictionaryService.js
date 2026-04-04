import { normalize } from './helpers.js';

export class DictionaryService {
  constructor() {
    this.normalizedSet = new Set();
  }

  initFromWords(WORDS) {
    this.normalizedSet = new Set(WORDS.map(w => normalize(w)));
  }

  has(word) {
    return this.normalizedSet.has(word);
  }

  addWord(word) {
    const trimmed = word.trim();
    if (trimmed) this.normalizedSet.add(normalize(trimmed));
  }

  async loadAcceptedWords(url = 'palavras_aceitas.txt') {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        text.split('\n').forEach(word => this.addWord(word));
      }
    } catch (error) {
      console.error('Error loading accepted words:', error);
    }
  }
}
