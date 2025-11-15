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

// Hằng số cho localStorage và ảnh thu nhỏ (Thumbnail)
const HISTORY_KEY = 'avatarHistory';
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
let needsRedraw = false; // Cờ để tối ưu hóa việc vẽ lại

// Tải các ảnh nền và khung mặc định
const backgroundImage = new Image();
backgroundImage.src = 'images/background.jpg';
const frameImage = new Image();
frameImage.src = 'images/frame.png';

// Hàm tiện ích để giới hạn một giá trị trong một khoảng min-max
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// --- CÁC HÀM XỬ LÝ CANVAS VÀ SLIDER ---

/**
 * Vẽ tất cả các lớp (nền, ảnh người dùng, khung) lên canvas chính.
 */
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

/**
 * Vòng lặp cập nhật để tối ưu hiệu suất vẽ.
 */
const updateLoop = () => {
    if (needsRedraw) {
        drawCanvas();
        needsRedraw = false;
    }
    requestAnimationFrame(updateLoop);
};

/**
 * Yêu cầu vẽ lại canvas vào khung hình tiếp theo.
 */
const requestRedraw = () => {
    needsRedraw = true;
};

/**
 * Tính toán kích thước của ảnh người dùng sau khi đã áp dụng tỷ lệ zoom.
 * @returns {object} Chứa scaledWidth và scaledHeight.
 */
const getScaledDimensions = () => {
    if (!userImage) return { scaledWidth: 0, scaledHeight: 0 };
    const circleDiameter = userImageCircle.radius * 2;
    const userImageAspectRatio = userImage.width / userImage.height;
    let baseWidth, baseHeight;
    if (userImageAspectRatio > 1) { // Ảnh ngang
        baseHeight = circleDiameter;
        baseWidth = baseHeight * userImageAspectRatio;
    } else { // Ảnh dọc hoặc vuông
        baseWidth = circleDiameter;
        baseHeight = baseWidth / userImageAspectRatio;
    }
    return { 
        scaledWidth: baseWidth * imageScale, 
        scaledHeight: baseHeight * imageScale 
    };
};

/**
 * Cập nhật trạng thái (bật/tắt) và dải giá trị (min/max) của các thanh trượt vị trí.
 */
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

/**
 * Đặt lại vị trí và độ phóng to của ảnh về giá trị mặc định.
 */
const resetImageState = () => {
    imageScale = 1; 
    imageX = 0; 
    imageY = 0;
    zoomSlider.value = 1;
    updateSliders();
};

// --- CÁC HÀM XỬ LÝ LỊCH SỬ ---

const saveAvatarToHistory = (dataURL) => {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    history.unshift(dataURL);
    if (history.length > MAX_HISTORY_ITEMS) {
        history = history.slice(0, MAX_HISTORY_ITEMS);
    }
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) {
        console.error("Lỗi khi lưu vào localStorage (có thể đã đầy):", e);
        alert("Không thể lưu vào lịch sử, bộ nhớ có thể đã đầy.");
    }
};

const renderHistory = () => {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    historyGrid.innerHTML = '';
    if (history.length === 0) {
        noHistoryMessage.style.display = 'block';
    } else {
        noHistoryMessage.style.display = 'none';
        history.forEach((dataURL, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            const img = document.createElement('img');
            img.src = dataURL;
            const downloadLink = document.createElement('a');
            downloadLink.href = dataURL;
            downloadLink.download = `avatar-history-thumb-${index + 1}.png`;
            downloadLink.className = 'history-download-btn';
            downloadLink.textContent = 'Tải';
            historyItem.appendChild(img);
            historyItem.appendChild(downloadLink);
            historyGrid.appendChild(historyItem);
        });
    }
};

// VỊ TRÍ SỬA: Thêm hàm mới để điều chỉnh kích thước slider
// MỤC ĐÍCH: Sửa lỗi hiển thị thanh trượt dọc bằng cách đặt chiều dài của nó bằng chiều cao của canvas.
const adjustVerticalSliderSize = () => {
    const canvasHeight = canvas.clientHeight;
    ySlider.style.width = `${canvasHeight}px`;
};

// --- GẮN CÁC SỰ KIỆN VÀO CÁC PHẦN TỬ GIAO DIỆN ---

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

mainDownloadButton.addEventListener('click', () => {
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

    saveAvatarToHistory(thumbnailDataURL);
    renderHistory();
    
    const link = document.createElement('a');
    link.href = highQualityDataURL;
    link.download = 'avatar-cua-ban.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// VỊ TRÍ SỬA: Thêm Event Listener cho sự kiện resize
// MỤC ĐÍCH: Đảm bảo thanh trượt dọc luôn được cập nhật kích thước khi cửa sổ thay đổi.
window.addEventListener('resize', adjustVerticalSliderSize);

// Chạy lần đầu khi trang và các ảnh mặc định đã tải xong
Promise.all([
    new Promise(resolve => backgroundImage.onload = resolve),
    new Promise(resolve => frameImage.onload = resolve)
]).then(() => {
    updateSliders();
    requestRedraw(); 
    renderHistory();
    // VỊ TRÍ SỬA: Gọi hàm để đặt kích thước ban đầu cho thanh trượt
    // MỤC ĐÍCH: Thiết lập kích thước đúng cho thanh trượt ngay khi trang tải xong.
    adjustVerticalSliderSize();
    updateLoop(); 
});