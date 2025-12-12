// js/seizure-video-upload.js
// Seizure video upload and management for specialist review

class SeizureVideoUploader {
    constructor() {
        this.maxFileSize = 25 * 1024 * 1024; // 25MB limit for Google Apps Script
        this.allowedFormats = ['video/mp4', 'video/webm', 'video/quicktime'];
        this.uploadQueue = [];
    }
    
    async uploadVideo(file, patientId) {
        // Validate file
        if (!this.validateFile(file)) {
            return { status: 'error', message: window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.invalidFormatOrSize') : 'Invalid file format or size' };
        }

        showLoader(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploading') : 'Uploading seizure video...');
        
        try {
            // Convert file to base64
            const base64Video = await this.fileToBase64(file);
            const videoDuration = await this.getVideoDuration(file);
            
            const payload = {
                patientId,
                fileName: file.name,
                fileData: base64Video,
                fileType: file.type,
                videoDuration,
                uploadedBy: window.currentUserName,
                uploadDate: new Date().toISOString()
            };
            
            window.Logger.debug('[SEIZURE-VIDEO] Uploading video:', { 
                patientId, 
                fileName: file.name, 
                fileSize: file.size, 
                base64Length: base64Video?.length || 0 
            });
            window.Logger.debug('seizure-video-upload.js: Uploading video', { patientId, fileName: file.name, size: file.size, base64Length: base64Video?.length || 0 });
            
            const response = await makeAPICall('uploadSeizureVideo', payload);
            
            window.Logger.debug('[SEIZURE-VIDEO] Upload response:', response);
            
            if (response.status === 'success') {
                window.Logger.debug('seizure-video-upload.js: Video uploaded successfully', response);
                
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadSuccess') : 'Video uploaded successfully. Specialist will review shortly.', 'success');
                
                // Reload video list if available
                if (window.loadPatientSeizureVideos) {
                    await window.loadPatientSeizureVideos(patientId);
                }
                
                return { status: 'success', videoId: response.data?.fileId };
            } else {
                throw new Error(response.message || (window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadFailed') : 'Upload failed'));
            }
        } catch (error) {
            window.Logger.error('seizure-video-upload.js: Video upload error', error);
            showNotification((window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadError') : 'Error uploading video: ') + error.message, 'error');
            return { status: 'error', message: error.message };
        } finally {
            hideLoader();
        }
    }
    
    validateFile(file) {
        if (file.size > this.maxFileSize) {
            showNotification((window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.fileTooLarge') : 'File too large. Maximum size is 25MB. Your file is ') + (file.size / 1024 / 1024).toFixed(1) + 'MB', 'error');
            return false;
        }

        if (!this.allowedFormats.includes(file.type)) {
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.invalidFormat') : 'Invalid format. Use MP4, WebM, or MOV files.', 'error');
            return false;
        }
        
        return true;
    }
    
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove data:video/mp4;base64, prefix
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }
    
    getVideoDuration(file) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = function() {
                window.URL.revokeObjectURL(video.src);
                resolve(Math.round(video.duration));
            };
            
            video.onerror = () => {
                window.URL.revokeObjectURL(video.src);
                resolve(0); // Default to 0 if unable to determine
            };
            
            video.src = URL.createObjectURL(file);
        });
    }
    
    async deleteVideo(videoId, patientId) {
        if (!confirm(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.confirmDelete') : 'Are you sure you want to delete this video?')) {
            return false;
        }

        showLoader(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.deleting') : 'Deleting video...');
        
        try {
            const payload = {
                videoId,
                patientId
            };
            
            const response = await makeAPICall('deleteSeizureVideo', payload);
            
            if (response.status === 'success') {
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.deleteSuccess') : 'Video deleted successfully', 'success');
                window.Logger.debug('seizure-video-upload.js: Video deleted', videoId);
                
                // Reload video list
                if (window.loadPatientSeizureVideos) {
                    await window.loadPatientSeizureVideos(patientId);
                }
                
                return true;
            }
        } catch (error) {
            window.Logger.error('seizure-video-upload.js: Error deleting video', error);
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.deleteError') : 'Error deleting video', 'error');
            return false;
        } finally {
            hideLoader();
        }
    }
}

// Global instance
let seizureVideoUploader = new SeizureVideoUploader();

// UI Component to render video upload interface
function renderVideoUploadInterface(patientId) {
    const html = `
        <div class="video-upload-container" style="padding: 20px; background: #f8f9fa; border-radius: 8px; margin-bottom: 20px;">
            <h5 style="margin-top: 0;">
                <i class="fas fa-video" style="color: var(--primary-color); margin-right: 8px;"></i>
                ${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadTitle') : 'Upload Seizure Video'}
            </h5>
            <p style="color: var(--medium-text); margin-bottom: 16px;">
                ${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadDesc') : 'Upload a video recording of the seizure. This helps specialists provide more accurate diagnosis and treatment recommendations.'}
            </p>
            <div class="upload-dropzone" id="videoDropzone" 
                 style="border: 2px dashed var(--primary-color); border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; background: #f0f6ff;">
                <i class="fas fa-cloud-upload-alt" style="font-size: 36px; color: var(--primary-color); display: block; margin-bottom: 10px;"></i>
                <p style="margin: 10px 0; font-weight: 500;">${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.dropOrBrowse') : 'Drag & drop video here or click to browse'}</p>
                <p style="font-size: 0.85rem; color: var(--medium-text); margin: 8px 0;">
                    ${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.supportedFormats') : 'Supported formats: MP4, WebM, MOV • Maximum size: 100MB'}
                </p>
                <input type="file" id="videoFileInput" accept="video/*" style="display: none;">
            </div>
            <div id="uploadProgress" style="display: none; margin-top: 16px;">
                <div style="margin-bottom: 8px;">
                    <small style="color: var(--medium-text);" id="uploadStatus">${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploadingShort') : 'Uploading...'}</small>
                </div>
                <div class="progress" style="height: 6px; background: #e9ecef; border-radius: 3px; overflow: hidden;">
                    <div class="progress-bar" id="uploadProgressBar" style="background: var(--success-color); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
            <div id="uploadedVideos" style="margin-top: 20px; display: none;">
                <h6 style="margin-bottom: 12px; color: var(--primary-color);">
                    <i class="fas fa-video" style="margin-right: 6px;"></i>
                    ${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.prevUploaded') : 'Previously Uploaded Videos'}
                </h6>
                <div id="videoList" style="max-height: 300px; overflow-y: auto;"></div>
            </div>
        </div>
    `;
    document.getElementById('seizureVideoSection').innerHTML = html;
    setupVideoUploadHandlers(patientId);
}

function setupVideoUploadHandlers(patientId) {
    const dropzone = document.getElementById('videoDropzone');
    const fileInput = document.getElementById('videoFileInput');
    
    if (!dropzone || !fileInput) {
        window.Logger.warn('seizure-video-upload.js: Video upload elements not found');
        return;
    }
    
    dropzone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            seizureVideoUploader.uploadVideo(file, patientId);
        }
    });
    
    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--success-color)';
        dropzone.style.backgroundColor = '#e8f5e9';
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = 'var(--primary-color)';
        dropzone.style.backgroundColor = '#f0f6ff';
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--primary-color)';
        dropzone.style.backgroundColor = '#f0f6ff';
        
        const file = e.dataTransfer.files[0];
        if (file) {
            seizureVideoUploader.uploadVideo(file, patientId);
        }
    });
    
    // Load existing videos
    loadPatientSeizureVideos(patientId);
}

async function loadPatientSeizureVideos(patientId) {
    try {
        window.Logger.debug('seizure-video-upload.js: Loading videos for patient', patientId);
        
        const payload = {
            patientId
        };
        
        const response = await makeAPICall('getPatientSeizureVideos', payload);
        
        if (response.status === 'success' && response.data) {
            const videos = response.data;
            const videoListContainer = document.getElementById('videoList');
            const uploadedVideosDiv = document.getElementById('uploadedVideos');
            
            if (videos.length > 0) {
                let html = '';
                videos.forEach(video => {
                    const parsedUploadDate = new Date(video.uploadDate);
                    const uploadDate = (typeof formatDateForDisplay === 'function')
                        ? formatDateForDisplay(parsedUploadDate)
                        : (typeof formatDateInDDMMYYYY === 'function'
                            ? formatDateInDDMMYYYY(parsedUploadDate)
                            : parsedUploadDate.toLocaleDateString('en-GB').replace(/\//g, '-'));
                    const duration = video.duration ? Math.floor(video.duration) + 's' : (window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.unknown') : 'Unknown');
                    html += `
                        <div style="padding: 12px; background: white; border-radius: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div style="flex: 1;">
                                <p style="margin: 0; font-weight: 500; font-size: 0.9rem;">
                                    <i class="fas fa-film" style="margin-right: 6px; color: var(--primary-color);"></i>
                                    ${video.fileName}
                                </p>
                                <small style="color: var(--medium-text);">
                                    ${(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.uploaded') : 'Uploaded:')} ${uploadDate} | ${(window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.duration') : 'Duration:')} ${duration}
                                </small>
                            </div>
                            <div style="display: flex; gap: 8px; margin-left: 8px;">
                                <a href="${video.viewUrl}" target="_blank" class="btn btn-sm btn-outline-primary" title="${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.viewVideo') : 'View video'}">
                                    <i class="fas fa-eye"></i>
                                </a>
                                <button class="btn btn-sm btn-outline-danger" onclick="seizureVideoUploader.deleteVideo('${video.fileId}', '${patientId}')" title="${window.EpicareI18n ? window.EpicareI18n.translate('seizureVideo.deleteVideo') : 'Delete video'}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                
                videoListContainer.innerHTML = html;
                uploadedVideosDiv.style.display = 'block';
            } else {
                uploadedVideosDiv.style.display = 'none';
            }
        }
    } catch (error) {
        window.Logger.warn('seizure-video-upload.js: Error loading videos', error);
    }
}

// Make it globally available
window.loadPatientSeizureVideos = loadPatientSeizureVideos;
window.renderVideoUploadInterface = renderVideoUploadInterface;

