
import React from 'react';
import type { Source } from '../types';
import { tr } from '../locales/tr';
import { LinkIcon } from './Icons';

interface SourcesPreviewProps {
  sources: Source[];
}

const SourcesPreview: React.FC<SourcesPreviewProps> = ({ sources }) => {
    // Helper to get a clean hostname from a URL
    const getHostname = (uri: string) => {
        try {
            return new URL(uri).hostname;
        } catch (e) {
            return uri; // Return original uri if it's not a valid URL
        }
    };
    
    return (
        <div className="mt-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                {tr.webSearch.sourcesTitle}
            </h4>
            <ul className="space-y-1.5">
                {sources.map((source, index) => (
                    <li key={index} className="flex items-start">
                        <span className="text-red-400 mr-2 mt-1 flex-shrink-0">•</span>
                        <a
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-300 hover:text-red-400 hover:underline break-all"
                            title={source.uri}
                        >
                            {source.title || getHostname(source.uri)}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default SourcesPreview;
