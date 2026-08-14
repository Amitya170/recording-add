import React from 'react';
import { CheckCircle2, AlertTriangle, ExternalLink, X, FolderOpen, RefreshCw } from 'lucide-react';
import { DEFAULT_FOLDER_URL } from '../../auth/GoogleDriveUploader';

export interface DriveUploadNotificationProps {
  type: 'success' | 'error';
  title: string;
  message: string;
  fileUrl?: string;
  error?: string;
  sessionTitle?: string;
  onClose: () => void;
  onRetry?: () => void;
}

export const DriveUploadNotificationModal: React.FC<DriveUploadNotificationProps> = ({
  type,
  title,
  message,
  fileUrl,
  error,
  sessionTitle,
  onClose,
  onRetry,
}) => {
  const isSuccess = type === 'success';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(3, 6, 12, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #0d1322, #070a12)',
          border: isSuccess ? '1px solid rgba(0, 255, 135, 0.4)' : '1px solid rgba(255, 42, 95, 0.4)',
          borderRadius: '14px',
          maxWidth: '480px',
          width: '100%',
          padding: '24px',
          boxShadow: isSuccess
            ? '0 10px 40px rgba(0, 255, 135, 0.25), 0 0 20px rgba(0, 255, 135, 0.15)'
            : '0 10px 40px rgba(255, 42, 95, 0.25), 0 0 20px rgba(255, 42, 95, 0.15)',
          position: 'relative',
          color: 'var(--text-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title="Close Popup"
        >
          <X size={16} />
        </button>

        {/* Icon & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isSuccess ? 'rgba(0, 255, 135, 0.15)' : 'rgba(255, 42, 95, 0.15)',
              border: isSuccess ? '1px solid rgba(0, 255, 135, 0.4)' : '1px solid rgba(255, 42, 95, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isSuccess ? (
              <CheckCircle2 size={24} color="var(--accent-green)" />
            ) : (
              <AlertTriangle size={24} color="var(--accent-red)" />
            )}
          </div>

          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.1rem',
                fontWeight: 700,
                color: isSuccess ? 'var(--accent-green)' : 'var(--accent-red)',
                letterSpacing: '0.3px',
              }}
            >
              {title}
            </h3>
            {sessionTitle && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {sessionTitle}
              </div>
            )}
          </div>
        </div>

        {/* Message Body */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '20px',
            fontSize: '0.82rem',
            lineHeight: 1.5,
            color: 'var(--text-secondary)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <p style={{ margin: 0 }}>{message}</p>
          {error && (
            <div
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--accent-red)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Details: {error}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {isSuccess && fileUrl && (
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-transport"
              style={{
                background: 'rgba(0, 255, 135, 0.18)',
                border: '1px solid rgba(0, 255, 135, 0.5)',
                color: 'var(--accent-green)',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <ExternalLink size={14} /> Open File in Google Drive
            </a>
          )}

          {isSuccess && (
            <a
              href={DEFAULT_FOLDER_URL}
              target="_blank"
              rel="noreferrer"
              className="btn-transport"
              style={{
                background: 'rgba(0, 240, 255, 0.1)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                color: 'var(--accent-cyan)',
                padding: '8px 14px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
              }}
            >
              <FolderOpen size={14} /> Open Drive Folder
            </a>
          )}

          {!isSuccess && onRetry && (
            <button
              className="btn-transport btn-cyan"
              onClick={onRetry}
              style={{
                padding: '8px 16px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={14} /> Retry Upload
            </button>
          )}

          <button
            className="btn-transport"
            onClick={onClose}
            style={{
              padding: '8px 14px',
              fontSize: '0.82rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
