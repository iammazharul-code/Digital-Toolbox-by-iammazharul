import React from 'react';

type Note = {
  title: string;
  body: string;
};

export const QuickNote: React.FC<{
  value: Note;
  onChange: (newValue: Note) => void;
  textColor: string;
}> = ({ value, onChange, textColor }) => {
  
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, title: e.target.value });
  };

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...value, body: e.target.value });
  };

  return (
    <div className="w-full h-full p-4 flex flex-col items-start">
        <input
            type="text"
            value={value.title}
            onChange={handleTitleChange}
            placeholder="Title"
            className="w-full bg-transparent resize-none focus:outline-none text-2xl font-bold mb-2 pb-2 border-b"
            style={{ 
              color: textColor, 
              borderColor: textColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' 
            }}
            spellCheck="false"
            onClick={(e) => e.stopPropagation()}
        />
        <textarea
            value={value.body}
            onChange={handleBodyChange}
            placeholder="Jot down your thoughts..."
            className="w-full flex-grow bg-transparent resize-none focus:outline-none text-lg custom-scrollbar"
            style={{ color: textColor }}
            spellCheck="false"
            onClick={(e) => e.stopPropagation()}
        />
    </div>
  );
};