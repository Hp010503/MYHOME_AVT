// Lấy các phần tử HTML cần thiết
const canvas = document.getElementById('avatarCanvas');
const ctx = canvas.getContext('2d');
const imageLoader = document.getElementById('imageLoader');
const mainDownloadButton = document.getElementById('mainDownloadButton');
const zoomSlider = document.getElementById('zoomSlider');
const xSlider = document.getElementById('xSlider');
const ySlider = document.getElementById('ySlider');
const historyGrid = document.getElementById('history-grid');
const noHistoryMessage = document.getElementById('no-history-message');
const loadingOverlay = document.getElementById('loading-overlay');
const historyModal = document.getElementById('history-modal');
const modalImage = document.getElementById('modal-image');
const closeModalButton = document.querySelector('.modal-close-button');

// Hằng số cho IndexedDB và Lịch sử
const DB_NAME = 'AvatarDB';
const DB_VERSION = 1;
const STORE_NAME = 'avatars';
const MAX_HISTORY_ITEMS = 12; 
const THUMBNAIL_SIZE = 200; 

// Hằng số cho canvas chính
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;
const userImageCircle = {x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, radius: 1795 / 2};

// Hằng số cho validation
const MAX_FILE_SIZE_MB = 30;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Biến lưu trữ trạng thái
let userImage = null;
let imageScale = 1;
let imageX = 0;
let imageY = 0;
let needsRedraw = false;
let dbInstance = null; // Biến để giữ kết nối tới DB

// Tải các ảnh nền và khung mặc định
const backgroundImage = new Image();
backgroundImage.src = 'images/background.jpg';
const frameImage = new Image();
frameImage.src = 'images/frame.png';

// VỊ TRÍ SỬA: Toàn bộ hệ thống lưu trữ được thay thế bằng IndexedDB Wrapper
// MỤC ĐÍCH: Cung cấp một phương thức lưu trữ bền vững, dung lượng lớn cho ảnh chất lượng cao.
const db = {
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject("Lỗi khi mở IndexedDB.");
            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    },

    async saveAvatar(avatar) {
        if (!dbInstance) await this.init();
        const transaction = dbInstance.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Thêm avatar mới
        store.add({ ...avatar, timestamp: Date.now() });

        // Đảm bảo không vượt quá giới hạn lịch sử
        const keys = await new Promise(resolve => {
            const allKeysRequest = store.getAllKeys();
            allKeysRequest.onsuccess = () => resolve(allKeysRequest.result);
        });

        if (keys.length > MAX_HISTORY_ITEMS) {
            const items = await new Promise(resolve => {
                const allItemsRequest = store.getAll();
                allItemsRequest.onsuccess = () => resolve(allItemsRequest.result);
            });
            // Sắp xếp để tìm mục cũ nhất
            items.sort((a, b) => a.timestamp - b.timestamp);
            store.delete(items[0].id);
        }

        return new Promise(resolve => transaction.oncomplete = resolve);
    },

    async getAvatars() {
        if (!dbInstance) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = dbInstance.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onerror = () => reject("Không thể lấy dữ liệu avatars.");
            request.onsuccess = () => {
                // Sắp xếp theo timestamp giảm dần (mới nhất trước)
                resolve(request.result.sort((a, b) => b.timestamp - a.timestamp));
            };
        });
    }
};


// Hàm tiện ích để giới hạn một giá trị trong một khoảng min-max
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// --- CÁC HÀM XỬ LÝ CANVAS VÀ SLIDER ---

const drawCanvas = () => {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.drawImage(backgroundImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    if (userImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(userImageCircle.x, userImageCircle.y, userImageCircle.radius, 0, Math.PI * 2, true);
        ctx.clip();
        const { scaledWidth, scaledHeight } = getScaledDimensions();
        const drawX = userImageCircle.x - (scaledWidth / 2) + imageX;
        const drawY = userImageCircle.y - (scaledHeight / 2) + imageY;
        ctx.drawImage(userImage, drawX, drawY, scaledWidth, scaledHeight);
        ctx.restore();
    }
    ctx.drawImage(frameImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
};

const updateLoop = () => {
    if (needsRedraw) {
        drawCanvas();
        needsRedraw = false;
    }
    requestAnimationFrame(updateLoop);
};

const requestRedraw = () => {
    needsRedraw = true;
};

const getScaledDimensions = () => {
    if (!userImage) return { scaledWidth: 0, scaledHeight: 0 };
    const circleDiameter = userImageCircle.radius * 2;
    const userImageAspectRatio = userImage.width / userImage.height;
    let baseWidth, baseHeight;
    if (userImageAspectRatio > 1) { 
        baseHeight = circleDiameter;
        baseWidth = baseHeight * userImageAspectRatio;
    } else {
        baseWidth = circleDiameter;
        baseHeight = baseWidth / userImageAspectRatio;
    }
    return { 
        scaledWidth: baseWidth * imageScale, 
        scaledHeight: baseHeight * imageScale 
    };
};

const updateSliders = () => {
    if (!userImage) { 
        xSlider.disabled = true; 
        ySlider.disabled = true; 
        return; 
    }
    xSlider.disabled = false; 
    ySlider.disabled = false;
    const { scaledWidth, scaledHeight } = getScaledDimensions();
    const maxOffsetX = Math.max(0, (scaledWidth - userImageCircle.radius * 2) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - userImageCircle.radius * 2) / 2);
    xSlider.min = -maxOffsetX; 
    xSlider.max = maxOffsetX; 
    xSlider.value = imageX;
    ySlider.min = -maxOffsetY; 
    ySlider.max = maxOffsetY; 
    ySlider.value = imageY; 
};

const resetImageState = () => {
    imageScale = 1; 
    imageX = 0; 
    imageY = 0;
    zoomSlider.value = 1;
    updateSliders();
};

// VỊ TRÍ SỬA: Hàm renderHistory được cập nhật để dùng IndexedDB
// MỤC ĐÍCH: Lấy dữ liệu từ DB và hiển thị, bao gồm cả việc gắn sự kiện xem ảnh gốc.
async function renderHistory() {
    const history = await db.getAvatars();
    historyGrid.innerHTML = '';
    if (history.length === 0) {
        noHistoryMessage.style.display = 'block';
    } else {
        noHistoryMessage.style.display = 'none';
        history.forEach((avatar, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            const img = document.createElement('img');
            img.src = avatar.thumbnailData; // Luôn hiển thị thumbnail trên lưới
            img.alt = `Avatar đã lưu lần ${index + 1}`;
            
            img.addEventListener('click', () => {
                modalImage.src = avatar.highQualityData; // Khi click, hiển thị ảnh gốc
                historyModal.style.display = 'flex';
            });

            const downloadLink = document.createElement('a');
            downloadLink.href = avatar.thumbnailData;
            downloadLink.download = `avatar-history-thumb-${index + 1}.png`;
            downloadLink.className = 'history-download-btn';
            downloadLink.textContent = 'Tải';
            historyItem.appendChild(img);
            historyItem.appendChild(downloadLink);
            historyGrid.appendChild(historyItem);
        });
    }
};

const adjustVerticalSliderSize = () => {
    const canvasHeight = canvas.clientHeight;
    ySlider.style.width = `${canvasHeight}px`;
};

// --- GẮN CÁC SỰ KIỆN ---

imageLoader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
            alert(`Kích thước file quá lớn. Vui lòng chọn ảnh nhỏ hơn ${MAX_FILE_SIZE_MB}MB.`);
            e.target.value = null; 
            return;
        }

        loadingOverlay.style.display = 'flex'; 

        const reader = new FileReader();
        reader.onload = (event) => {
            userImage = new Image();
            userImage.onload = () => {
                resetImageState();
                requestRedraw(); 
                loadingOverlay.style.display = 'none'; 
            };
            userImage.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

zoomSlider.addEventListener('input', () => {
    if (!userImage) return;
    imageScale = parseFloat(zoomSlider.value);
    const { scaledWidth, scaledHeight } = getScaledDimensions();
    const maxOffsetX = Math.max(0, (scaledWidth - userImageCircle.radius * 2) / 2);
    const maxOffsetY = Math.max(0, (scaledHeight - userImageCircle.radius * 2) / 2);
    imageX = clamp(imageX, -maxOffsetX, maxOffsetX);
    imageY = clamp(imageY, -maxOffsetY, maxOffsetY);
    updateSliders();
    requestRedraw();
});

xSlider.addEventListener('input', () => {
    if (!userImage) return;
    imageX = parseFloat(xSlider.value);
    requestRedraw();
});

ySlider.addEventListener('input', () => {
    if (!userImage) return;
    imageY = parseFloat(ySlider.value); 
    requestRedraw();
});

// VỊ TRÍ SỬA: Cập nhật sự kiện click của nút download để dùng IndexedDB
// MỤC ĐÍCH: Lưu cả ảnh thumbnail và ảnh gốc vào cơ sở dữ liệu.
mainDownloadButton.addEventListener('click', async () => {
    if (!userImage) {
        alert("Vui lòng chọn một ảnh trước khi tải xuống!");
        return; 
    }

    const highQualityDataURL = canvas.toDataURL('image/png');
    
    const thumbCanvas = document.createElement('canvas');
    const thumbCtx = thumbCanvas.getContext('2d');
    thumbCanvas.width = THUMBNAIL_SIZE;
    thumbCanvas.height = THUMBNAIL_SIZE;
    thumbCtx.drawImage(canvas, 0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
    const thumbnailDataURL = thumbCanvas.toDataURL('image/png');

    await db.saveAvatar({
        thumbnailData: thumbnailDataURL,
        highQualityData: highQualityDataURL
    });

    await renderHistory();
    
    const link = document.createElement('a');
    link.href = highQualityDataURL;
    link.download = 'avatar-cua-ban.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

window.addEventListener('resize', adjustVerticalSliderSize);

const closeModal = () => {
    historyModal.style.display = 'none';
};

closeModalButton.addEventListener('click', closeModal);

historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        closeModal();
    }
});


// --- KHỞI CHẠY ỨNG DỤNG ---
Promise.all([
    new Promise(resolve => backgroundImage.onload = resolve),
    new Promise(resolve => frameImage.onload = resolve)
]).then(async () => { // Chuyển sang async
    await db.init(); // Khởi tạo DB trước
    updateSliders();
    requestRedraw(); 
    await renderHistory(); // Sau đó render lịch sử
    adjustVerticalSliderSize();
    updateLoop(); 
});
