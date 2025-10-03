import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  actions?: React.ReactNode;
}

const Card: React.FC<CardProps> = ({ children, className = '', title, actions }) => {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700/50 ${className}`}>
      {title && (
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
          {actions}
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
};

export default Card;
