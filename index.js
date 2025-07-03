// index.js - Complete version with dependencies and assigned column
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Create S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Configuration
const BUCKET_NAME = process.env.S3_BUCKET || 'gantt-chart-files';
const EXCEL_FILE_KEY = 'latest-gantt.xlsx';

exports.handler = async (event) => {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        const httpMethod = event.httpMethod || event.requestContext?.http?.method;
        const path = event.path || event.rawPath || '/';
        
        // Handle different routes
        if (httpMethod === 'GET' && path === '/') {
            // Serve the main HTML page
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': '*'
                },
                body: getHtmlContent()
            };
        } else if (httpMethod === 'POST' && path === '/upload') {
            // Handle file upload
            return await handleFileUpload(event);
        } else if (httpMethod === 'GET' && path === '/download') {
            // Generate presigned URL for downloading the Excel file
            return await getDownloadUrl();
        } else if (httpMethod === 'OPTIONS') {
            // Handle CORS preflight
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type'
                },
                body: ''
            };
        } else {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'Not found' })
            };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: error.message })
        };
    }
};

async function handleFileUpload(event) {
    try {
        // Parse the base64 encoded file from the request body
        const body = JSON.parse(event.body);
        const fileContent = Buffer.from(body.file, 'base64');
        
        // Upload to S3
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: EXCEL_FILE_KEY,
            Body: fileContent,
            ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        
        await s3Client.send(command);
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
                success: true, 
                message: 'File uploaded successfully' 
            })
        };
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

async function getDownloadUrl() {
    try {
        // Check if file exists
        const headCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: EXCEL_FILE_KEY
        });
        
        await s3Client.send(headCommand);
        
        // Generate presigned URL valid for 1 hour
        const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: EXCEL_FILE_KEY
        });
        
        const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ url })
        };
    } catch (error) {
        if (error.name === 'NotFound') {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'No file uploaded yet' })
            };
        }
        throw error;
    }
}

function getHtmlContent() {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MS Project Style Gantt Chart Viewer</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        /* Ensure consistent rendering */
        .task-panel *, .gantt-panel * {
            box-sizing: border-box;
        }
        
        /* Override any browser defaults */
        .task-panel, .gantt-panel {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        /* Ensure panels align at the top */
        #taskList {
            padding: 0;
            margin: 0;
            display: block;
        }
        
        #ganttRows {
            padding: 0;
            margin: 0;
            display: block;
            position: relative;
        }
        
        /* Ensure consistent scrollbar rendering */
        .task-panel::-webkit-scrollbar,
        .gantt-panel::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }
        
        .task-panel::-webkit-scrollbar-track,
        .gantt-panel::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        .task-panel::-webkit-scrollbar-thumb,
        .gantt-panel::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 6px;
        }
        
        .task-panel::-webkit-scrollbar-thumb:hover,
        .gantt-panel::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
        
        /* Force identical row rendering */
        .task-row:first-child, .gantt-row:first-child {
            margin-top: 0 !important;
        }
        
        .task-row:last-child, .gantt-row:last-child {
            margin-bottom: 0 !important;
        }
        
        /* Final alignment insurance */
        #taskList, #ganttRows {
            transform: translateZ(0); /* Force GPU rendering for consistency */
            will-change: transform;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            overflow: hidden;
        }
        
        /* File Upload Screen */
        .upload-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .upload-box {
            background: white;
            padding: 60px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 600px;
        }
        
        .upload-box h1 {
            color: #333;
            margin-bottom: 20px;
            font-size: 32px;
        }
        
        .upload-box p {
            color: #666;
            margin-bottom: 40px;
            font-size: 16px;
        }
        
        .file-input-wrapper {
            position: relative;
            overflow: hidden;
            display: inline-block;
        }
        
        .file-input-wrapper input[type=file] {
            position: absolute;
            left: -9999px;
        }
        
        .file-input-label {
            display: inline-block;
            padding: 15px 40px;
            background: #4472C4;
            color: white;
            border-radius: 30px;
            cursor: pointer;
            transition: all 0.3s;
            font-size: 16px;
            font-weight: 500;
        }
        
        .file-input-label:hover {
            background: #5582D4;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        }
        
        .file-input-label.loading {
            background: #999;
            cursor: not-allowed;
        }
        
        .file-info {
            margin-top: 20px;
            color: #666;
            font-size: 14px;
        }
        
        .load-existing-btn {
            margin-top: 30px;
            padding: 12px 30px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 25px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        
        .load-existing-btn:hover {
            background: #218838;
            transform: translateY(-2px);
        }
        
        /* Main Container */
        .container {
            display: none;
            flex-direction: column;
            height: 100vh;
            background: white;
        }
        
        /* Header */
        .header {
            height: 50px;
            background: linear-gradient(to bottom, #2c5aa0, #1e3c72);
            color: white;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .header h1 {
            font-size: 20px;
            font-weight: 400;
        }
        
        .header-buttons {
            display: flex;
            gap: 10px;
        }
        
        .header-button {
            padding: 8px 16px;
            background: rgba(255,255,255,0.2);
            border: none;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        
        .header-button:hover {
            background: rgba(255,255,255,0.3);
        }
        
        .main-content {
            display: flex;
            flex: 1;
            height: calc(100vh - 50px);
            overflow: hidden;
        }
        
        /* Task List Panel */
        .task-panel {
            width: 670px;
            border-right: 2px solid #ddd;
            overflow-y: auto;
            overflow-x: hidden;
            background: #fafafa;
            flex-shrink: 0;
        }
        
        .task-header {
            display: flex;
            background: #e0e0e0;
            border-bottom: 2px solid #ccc;
            position: sticky;
            top: 0;
            z-index: 10;
            height: 40px;
            box-sizing: border-box;
        }
        
        .task-header > div {
            padding: 10px;
            border-right: 1px solid #ccc;
            font-weight: bold;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            box-sizing: border-box;
            margin: 0;
        }
        
        .col-task-name { width: 280px; justify-content: flex-start; }
        .col-duration { width: 60px; }
        .col-start { width: 95px; }
        .col-end { width: 95px; }
        .col-remaining { width: 70px; }
        .col-assigned { width: 120px; }
        
        /* Task Rows - ensure exact same rendering */
        .task-row, .gantt-row {
            font-size: 12px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        .task-row {
            display: flex;
            border-bottom: 1px solid #e0e0e0;
            height: 27px;
            box-sizing: content-box;
            align-items: center;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .task-row:hover {
            background: #e8f4f8;
        }
        
        .task-row.project {
            background: #4472C4;
            color: white;
            font-weight: bold;
            font-size: 12px;
            height: 27px;
        }
        
        .task-row.project:hover {
            background: #5582D4;
        }
        
        .task-row.collapsed {
            display: none;
        }
        
        .task-row > div {
            padding: 0 8px;
            border-right: 1px solid #e0e0e0;
            font-size: 12px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            box-sizing: border-box;
            margin: 0;
            line-height: 27px;
            height: 27px;
        }
        
        .task-name {
            width: 280px;
            display: flex;
            align-items: center;
            margin: 0;
            height: 27px;
            overflow: hidden;
        }
        
        .task-row.level-1 .task-name { padding-left: 25px !important; }
        .task-row.level-2 .task-name { padding-left: 45px !important; }
        
        .expand-icon {
            margin-right: 5px;
            cursor: pointer;
            user-select: none;
            transition: transform 0.2s;
            display: inline-flex;
            align-items: center;
            line-height: 27px;
            font-size: 12px;
        }
        
        .expand-icon.collapsed {
            transform: rotate(-90deg);
        }
        
        .task-duration { width: 60px; text-align: center; line-height: 27px; }
        .task-start { width: 95px; text-align: center; line-height: 27px; }
        .task-end { width: 95px; text-align: center; line-height: 27px; }
        .task-remaining { width: 70px; text-align: center; line-height: 27px; }
        .task-assigned { 
            width: 120px; 
            text-align: center;
            font-size: 11px;
            color: #666;
            line-height: 27px;
        }
        
        .task-row.project .task-assigned {
            color: white;
        }
        
        .task-remaining.overdue {
            color: #e74c3c;
            font-weight: bold;
        }
        
        .task-remaining.due-soon {
            color: #f39c12;
            font-weight: bold;
        }
        
        /* Gantt Chart Panel */
        .gantt-panel {
            flex: 1;
            overflow: auto;
            position: relative;
        }
        
        .gantt-container {
            position: relative;
            min-width: 1000px;
            box-sizing: border-box;
            padding: 0;
            margin: 0;
        }
        
        /* Timeline Header */
        .timeline-header {
            position: sticky;
            top: 0;
            background: #e0e0e0;
            border-bottom: 2px solid #ccc;
            z-index: 10;
            height: 60px;
            box-sizing: border-box;
        }
        
        .month-row {
            height: 30px;
            display: flex;
            border-bottom: 1px solid #ccc;
        }
        
        .month-cell {
            border-right: 1px solid #ccc;
            text-align: center;
            font-weight: bold;
            font-size: 12px;
            line-height: 30px;
            background: #f0f0f0;
        }
        
        .day-row {
            height: 30px;
            display: flex;
        }
        
        .day-cell {
            border-right: 1px solid #ddd;
            text-align: center;
            font-size: 10px;
            line-height: 30px;
            width: 30px;
            flex-shrink: 0;
        }
        
        .day-cell.weekend {
            background: #f5f5f5;
        }
        
        .day-cell.today {
            background: #ffe6e6;
            font-weight: bold;
        }
        
        /* Gantt Bars */
        .gantt-rows {
            position: relative;
            box-sizing: border-box;
            background: transparent;
        }
        
        /* SVG and grid lines should not affect row layout */
        .dependency-container, .grid-lines, .today-line {
            position: absolute !important;
            top: 0;
            left: 0;
            pointer-events: none;
        }
        
        /* Ensure gantt rows are properly stacked */
        .gantt-row {
            height: 27px;
            box-sizing: content-box;
            border-bottom: 1px solid #e0e0e0;
            position: relative;
            margin: 0;
            padding: 0;
        }
        
        .gantt-row.project {
            background: rgba(68, 114, 196, 0.1);
            height: 27px;
        }
        
        .gantt-row.collapsed {
            display: none;
        }
        
        .gantt-bar {
            position: absolute;
            height: 19px;
            top: 4px;
            border-radius: 3px;
            cursor: pointer;
            transition: opacity 0.2s;
            z-index: 2;
            display: flex;
            align-items: center;
            padding: 0 4px;
            font-size: 10px;
            color: white;
            overflow: hidden;
            box-sizing: border-box;
        }
        
        .gantt-bar:hover {
            opacity: 0.8;
            z-index: 3;
        }
        
        .gantt-bar.project {
            background: #4472C4;
            height: 21px;
            top: 3px;
            font-weight: bold;
        }
        
        .gantt-bar.task {
            background: #70AD47;
        }
        
        .gantt-bar.subtask {
            background: #FFC000;
            height: 16px;
            top: 5px;
        }
        
        .gantt-bar.overdue {
            background: #e74c3c;
        }
        
        .gantt-bar.due-soon {
            background: #f39c12;
        }
        
        .gantt-bar.no-dates {
            background: #95a5a6;
            border: 2px dashed #7f8c8d;
        }
        
        /* Today Line */
        .today-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 2px;
            background: #e74c3c;
            z-index: 5;
            pointer-events: none;
        }
        
        .today-label {
            position: absolute;
            top: -20px;
            left: -20px;
            background: #e74c3c;
            color: white;
            padding: 2px 8px;
            font-size: 10px;
            border-radius: 3px;
            white-space: nowrap;
        }
        
        /* Grid Lines */
        .grid-lines {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            right: 0;
            pointer-events: none;
        }
        
        .grid-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: #f0f0f0;
        }
        
        .grid-line.week {
            background: #e0e0e0;
        }
        
        .grid-line.month {
            background: #ccc;
        }
        
        /* Dependency lines */
        .dependency-container {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            z-index: 1;
        }

        .dependency-line {
            stroke: #666;
            stroke-width: 2;
            fill: none;
            marker-end: url(#arrowhead);
            opacity: 0.6;
        }
        
        .dependency-line:hover {
            stroke: #333;
            stroke-width: 3;
            opacity: 1;
        }
        
        /* Tooltip */
        .tooltip {
            position: absolute;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 15px;
            border-radius: 5px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
            display: none;
            max-width: 350px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        
        .tooltip-title {
            font-weight: bold;
            margin-bottom: 8px;
            font-size: 14px;
            border-bottom: 1px solid rgba(255,255,255,0.3);
            padding-bottom: 5px;
        }
        
        .tooltip-row {
            margin: 4px 0;
            display: flex;
            justify-content: space-between;
            gap: 10px;
        }
        
        .tooltip-label {
            font-weight: 600;
            color: #ccc;
        }
        
        /* Loading */
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px 50px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            z-index: 2000;
            text-align: center;
        }
        
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #f3f3f3;
            border-top: 4px solid #4472C4;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* Legend */
        .legend {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-size: 12px;
        }
        
        .legend-title {
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin: 5px 0;
        }
        
        .legend-color {
            width: 20px;
            height: 14px;
            margin-right: 8px;
            border-radius: 3px;
        }
        
        .error-message {
            color: #e74c3c;
            margin-top: 10px;
            font-size: 14px;
        }
        
        .success-message {
            color: #28a745;
            margin-top: 10px;
            font-size: 14px;
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
</head>
<body>
    <!-- File Upload Screen -->
    <div class="upload-container" id="uploadContainer">
        <div class="upload-box">
            <h1>📊 MS Project Style Gantt Chart</h1>
            <p>Cargue su archivo Excel de Proyectos Abiertos para visualizarlo como un diagrama de Gantt interactivo</p>
            
            <div class="file-input-wrapper">
                <input type="file" id="fileInput" accept=".xlsx,.xls" />
                <label for="fileInput" class="file-input-label" id="fileInputLabel">
                    Seleccionar Archivo Excel
                </label>
            </div>
            
            <div class="file-info">
                Formatos soportados: .xlsx, .xls
            </div>
            
            <button class="load-existing-btn" id="loadExistingBtn" onclick="loadExistingFile()">
                Cargar Archivo Existente
            </button>
            
            <div id="uploadMessage"></div>
        </div>
    </div>
    
    <!-- Main Container -->
    <div class="container" id="container">
        <div class="header">
            <h1>📊 Diagrama de Gantt - <span id="projectTitle">Proyectos Abiertos</span></h1>
            <div class="header-buttons">
                <button class="header-button" onclick="expandAll()">Expandir Todo</button>
                <button class="header-button" onclick="collapseAll()">Colapsar Todo</button>
                <button class="header-button" onclick="resetView()">Vista Inicial</button>
                <button class="header-button" onclick="loadNewFile()">Cargar Otro Archivo</button>
            </div>
        </div>
        
        <div class="main-content">
            <div class="task-panel" id="taskPanel">
                <div class="task-header">
                    <div class="col-task-name">Nombre de Tarea</div>
                    <div class="col-duration">Días</div>
                    <div class="col-start">Inicio</div>
                    <div class="col-end">Fin</div>
                    <div class="col-remaining">Restante</div>
                    <div class="col-assigned">Asignado a</div>
                </div>
                <div id="taskList"></div>
            </div>
            
            <div class="gantt-panel" id="ganttPanel">
                <div class="gantt-container" id="ganttContainer">
                    <div class="timeline-header" id="timelineHeader"></div>
                    <div class="gantt-rows" id="ganttRows">
                        <div class="grid-lines" id="gridLines"></div>
                        <div class="today-line" id="todayLine">
                            <div class="today-label">HOY</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Legend -->
        <div class="legend">
            <div class="legend-title">Leyenda</div>
            <div class="legend-item">
                <div class="legend-color" style="background: #4472C4;"></div>
                <span>Proyecto</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #70AD47;"></div>
                <span>Tarea</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #FFC000;"></div>
                <span>Subtarea</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #e74c3c;"></div>
                <span>Vencida</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #f39c12;"></div>
                <span>Próxima a vencer</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: #666;"></div>
                <span>→ Dependencias</span>
            </div>
        </div>
    </div>
    
    <!-- Loading Screen -->
    <div class="loading" id="loading" style="display: none;">
        <div class="loading-spinner"></div>
        <div>Procesando archivo Excel...</div>
    </div>
    
    <!-- Tooltip -->
    <div class="tooltip" id="tooltip"></div>
    
    <script>
        // Global variables
        let ganttData = [];
        let minDate, maxDate;
        let dayWidth = 30;
        const rowHeight = 28; // Must match CSS: 27px height + 1px border = 28px total
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let projectStates = {}; // Track expanded/collapsed state
        
        // Get API endpoint from current URL
        const API_ENDPOINT = window.location.origin + window.location.pathname.replace(/\\/$/, '');
        
        // File input handler
        document.getElementById('fileInput').addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                uploadFile(file);
            }
        });
        
        // Upload file to Lambda
        async function uploadFile(file) {
            const label = document.getElementById('fileInputLabel');
            const message = document.getElementById('uploadMessage');
            
            label.textContent = 'Subiendo archivo...';
            label.classList.add('loading');
            message.innerHTML = '';
            
            try {
                // Read file as base64
                const reader = new FileReader();
                reader.onload = async function(e) {
                    const base64 = btoa(String.fromCharCode(...new Uint8Array(e.target.result)));
                    
                    // Send to Lambda
                    const response = await fetch(API_ENDPOINT + '/upload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ file: base64 })
                    });
                    
                    const result = await response.json();
                    
                    if (response.ok && result.success) {
                        message.innerHTML = '<div class="success-message">Archivo subido exitosamente!</div>';
                        setTimeout(() => {
                            loadExistingFile();
                        }, 1000);
                    } else {
                        throw new Error(result.error || 'Error al subir archivo');
                    }
                };
                reader.readAsArrayBuffer(file);
                
            } catch (error) {
                console.error('Upload error:', error);
                message.innerHTML = '<div class="error-message">Error: ' + error.message + '</div>';
                label.textContent = 'Seleccionar Archivo Excel';
                label.classList.remove('loading');
            }
        }
        
        // Load existing file from S3
        async function loadExistingFile() {
            document.getElementById('loading').style.display = 'block';
            
            try {
                // Get download URL from Lambda
                const response = await fetch(API_ENDPOINT + '/download');
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.error || 'No hay archivo disponible');
                }
                
                // Download file from S3
                const fileResponse = await fetch(result.url);
                const arrayBuffer = await fileResponse.arrayBuffer();
                
                // Process with SheetJS
                const data = new Uint8Array(arrayBuffer);
                const workbook = XLSX.read(data, {
                    type: 'array',
                    cellDates: true,
                    cellNF: true,
                    cellStyles: true
                });
                
                // Find the right sheet
                let sheetName = 'Proyectos Abiertos';
                if (!workbook.Sheets[sheetName]) {
                    sheetName = workbook.SheetNames[0];
                }
                
                // Read the sheet
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, {
                    header: 1,
                    raw: false,
                    dateNF: 'yyyy-mm-dd'
                });
                
                // Process the data
                processExcelData(jsonData);
                
                // Update title
                document.getElementById('projectTitle').textContent = sheetName;
                
                // Hide upload screen and show Gantt
                document.getElementById('uploadContainer').style.display = 'none';
                document.getElementById('container').style.display = 'flex';
                document.getElementById('loading').style.display = 'none';
                
            } catch (error) {
                console.error('Error loading file:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('uploadMessage').innerHTML = 
                    '<div class="error-message">Error: ' + error.message + '</div>';
            }
        }
        
        // Process Excel data
        function processExcelData(data) {
            const headers = data[0];
            ganttData = [];
            
            // Find column indices
            const colIndices = {
                level: headers.findIndex(h => h === 'Level'),
                id: headers.findIndex(h => h === 'ID'),
                taskName: headers.findIndex(h => h === 'Task Name'),
                description: headers.findIndex(h => h === 'Descripción'),
                startDate: headers.findIndex(h => h === 'Start Date'),
                endDate: headers.findIndex(h => h === 'End Date'),
                dias: headers.findIndex(h => h === 'Días'),
                restante: headers.findIndex(h => h === 'Restante'),
                assignedTo: headers.findIndex(h => h === 'Assigned To'),
                dependencies: headers.findIndex(h => h === 'Dependencies'),
                status: headers.findIndex(h => h === 'Status'),
                type: headers.findIndex(h => h === 'Type')
            };
            
            // Process rows
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;
                
                const task = {
                    level: parseInt(row[colIndices.level]) || 0,
                    id: row[colIndices.id] || '',
                    taskName: row[colIndices.taskName] || '',
                    description: row[colIndices.description] || '',
                    startDate: parseDate(row[colIndices.startDate]),
                    endDate: parseDate(row[colIndices.endDate]),
                    dias: parseInt(row[colIndices.dias]) || 0,
                    restante: row[colIndices.restante] !== '' ? parseInt(row[colIndices.restante]) : null,
                    assignedTo: row[colIndices.assignedTo] || '',
                    dependencies: row[colIndices.dependencies] || '',
                    status: row[colIndices.status] || '',
                    type: row[colIndices.type] || '',
                    rowIndex: i - 1,
                    projectId: null
                };
                
                // Assign project ID
                if (task.type === 'Project') {
                    task.projectId = task.id;
                    projectStates[task.id] = true; // Expanded by default
                } else if (ganttData.length > 0) {
                    // Find parent project
                    for (let j = ganttData.length - 1; j >= 0; j--) {
                        if (ganttData[j].type === 'Project') {
                            task.projectId = ganttData[j].id;
                            break;
                        }
                    }
                }
                
                ganttData.push(task);
            }
            
            // Calculate date range
            calculateDateRange();
            
            // Render the Gantt chart
            renderGantt();
        }
        
        // Parse date from various formats
        function parseDate(dateValue) {
            if (!dateValue) return null;
            
            // If it's already a Date object
            if (dateValue instanceof Date) {
                return isNaN(dateValue) ? null : dateValue;
            }
            
            // Try parsing as string
            const date = new Date(dateValue);
            return isNaN(date) ? null : date;
        }
        
        // Calculate date range
        function calculateDateRange() {
            const dates = ganttData
                .flatMap(task => [task.startDate, task.endDate])
                .filter(date => date && !isNaN(date));
            
            if (dates.length === 0) {
                minDate = new Date();
                maxDate = new Date();
                maxDate.setMonth(maxDate.getMonth() + 6);
            } else {
                minDate = new Date(Math.min(...dates));
                maxDate = new Date(Math.max(...dates));
            }
            
            // Add padding
            minDate.setDate(minDate.getDate() - 30);
            maxDate.setDate(maxDate.getDate() + 60);
        }
        
        // Render the Gantt chart
        function renderGantt() {
            const taskList = document.getElementById('taskList');
            const ganttRows = document.getElementById('ganttRows');
            const timelineHeader = document.getElementById('timelineHeader');
            
            // Clear existing content
            taskList.innerHTML = '';
            ganttRows.innerHTML = \`
                <svg class="dependency-container" id="dependencyContainer" style="position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1;">
                    <defs>
                        <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                                refX="9" refY="3.5" orient="auto" fill="#666">
                            <polygon points="0 0, 10 3.5, 0 7" />
                        </marker>
                    </defs>
                </svg>
                <div class="grid-lines" id="gridLines" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none;"></div>
                <div class="today-line" id="todayLine" style="position: absolute; top: 0; width: 2px; background: #e74c3c; z-index: 5; pointer-events: none;">
                    <div class="today-label">HOY</div>
                </div>
            \`;
            timelineHeader.innerHTML = '';
            
            // Calculate total days
            const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
            
            // Set container width
            const ganttContainer = document.getElementById('ganttContainer');
            ganttContainer.style.minWidth = (totalDays * dayWidth) + 'px';
            
            // Render timeline header
            renderTimeline(timelineHeader, totalDays);
            
            // Render grid lines
            renderGridLines(totalDays);
            
            // Position today line
            positionTodayLine();
            
            // Render tasks
            ganttData.forEach((task, index) => {
                // Create task row in left panel
                const taskRow = createTaskRow(task, index);
                taskList.appendChild(taskRow);
                
                // Create gantt row
                const ganttRow = createGanttRow(task, index);
                ganttRows.appendChild(ganttRow);
            });
            
            // Sync scroll between panels
            syncScroll();
            
            // Render dependencies after a short delay to ensure DOM is ready
            setTimeout(() => {
                renderDependencies();
            }, 100);
        }
        
        // Create task row for left panel
        function createTaskRow(task, index) {
            const row = document.createElement('div');
            row.className = \`task-row \${task.type.toLowerCase()} level-\${task.level}\`;
            row.dataset.taskId = task.id;
            row.dataset.index = index;
            
            // Check if should be collapsed
            if (task.type !== 'Project' && task.projectId && !projectStates[task.projectId]) {
                row.classList.add('collapsed');
            }
            
            // Task name
            const taskName = document.createElement('div');
            taskName.className = 'task-name';
            
            if (task.type === 'Project') {
                const expandIcon = document.createElement('span');
                expandIcon.className = 'expand-icon';
                expandIcon.textContent = projectStates[task.id] ? '▼' : '▶';
                if (!projectStates[task.id]) {
                    expandIcon.classList.add('collapsed');
                }
                expandIcon.onclick = (e) => {
                    e.stopPropagation();
                    toggleProject(task.id);
                };
                taskName.appendChild(expandIcon);
            }
            
            const nameText = document.createElement('span');
            nameText.textContent = task.taskName;
            taskName.appendChild(nameText);
            
            // Duration
            const duration = document.createElement('div');
            duration.className = 'task-duration';
            duration.textContent = task.dias || '';
            
            // Start date
            const startDate = document.createElement('div');
            startDate.className = 'task-start';
            startDate.textContent = task.startDate ? formatDate(task.startDate) : '';
            
            // End date
            const endDate = document.createElement('div');
            endDate.className = 'task-end';
            endDate.textContent = task.endDate ? formatDate(task.endDate) : '';
            
            // Remaining days
            const remaining = document.createElement('div');
            remaining.className = 'task-remaining';
            if (task.restante !== null) {
                remaining.textContent = task.restante;
                if (task.restante < 0) {
                    remaining.classList.add('overdue');
                } else if (task.restante <= 3) {
                    remaining.classList.add('due-soon');
                }
            }
            
            // Assigned to
            const assigned = document.createElement('div');
            assigned.className = 'task-assigned';
            assigned.textContent = task.assignedTo || '-';
            assigned.title = task.assignedTo || 'No asignado'; // Tooltip for full name
            
            row.appendChild(taskName);
            row.appendChild(duration);
            row.appendChild(startDate);
            row.appendChild(endDate);
            row.appendChild(remaining);
            row.appendChild(assigned);
            
            // Click handler
            row.onclick = () => selectTask(task.id, index);
            
            return row;
        }
        
        // Create Gantt row
        function createGanttRow(task, index) {
            const row = document.createElement('div');
            row.className = \`gantt-row \${task.type.toLowerCase()}\`;
            row.dataset.taskId = task.id;
            row.dataset.index = index;
            
            // Check if should be collapsed
            if (task.type !== 'Project' && task.projectId && !projectStates[task.projectId]) {
                row.classList.add('collapsed');
            }
            
            // Create Gantt bar if dates exist
            if (task.startDate || task.endDate) {
                const bar = createGanttBar(task);
                if (bar) row.appendChild(bar);
            }
            
            return row;
        }
        
        // Create Gantt bar
        function createGanttBar(task) {
            const bar = document.createElement('div');
            bar.className = \`gantt-bar \${task.type.toLowerCase()}\`;
            bar.dataset.taskId = task.id; // Add this for dependency rendering
            
            let startDays, duration;
            
            if (task.startDate && task.endDate) {
                // Both dates exist
                startDays = Math.floor((task.startDate - minDate) / (1000 * 60 * 60 * 24));
                duration = Math.ceil((task.endDate - task.startDate) / (1000 * 60 * 60 * 24)) + 1;
            } else if (task.startDate && !task.endDate) {
                // Only start date
                startDays = Math.floor((task.startDate - minDate) / (1000 * 60 * 60 * 24));
                duration = 7; // Default 1 week
                bar.classList.add('no-dates');
            } else if (!task.startDate && task.endDate) {
                // Only end date
                duration = 7; // Default 1 week
                startDays = Math.floor((task.endDate - minDate) / (1000 * 60 * 60 * 24)) - duration;
                bar.classList.add('no-dates');
            } else {
                return null; // No dates
            }
            
            bar.style.left = (startDays * dayWidth) + 'px';
            bar.style.width = (duration * dayWidth) + 'px';
            
            // Add status colors
            if (task.restante !== null && task.restante < 0) {
                bar.classList.add('overdue');
            } else if (task.restante !== null && task.restante <= 3) {
                bar.classList.add('due-soon');
            }
            
            // Add task name for wide bars
            if (duration * dayWidth > 100) {
                bar.textContent = task.taskName;
            }
            
            // Tooltip
            bar.onmouseover = (e) => showTooltip(e, task);
            bar.onmouseout = hideTooltip;
            
            return bar;
        }
        
        // Render dependencies
        function renderDependencies() {
            const svg = document.getElementById('dependencyContainer');
            const ganttContainer = document.getElementById('ganttContainer');
            
            // Clear existing lines
            svg.querySelectorAll('path').forEach(path => path.remove());
            
            // Set SVG size
            svg.style.width = ganttContainer.scrollWidth + 'px';
            svg.style.height = (ganttData.length * 28) + 'px'; // 28px total height per row
            
            // Process each task with dependencies
            ganttData.forEach((task, toIndex) => {
                if (task.dependencies && task.dependencies.trim() !== '') {
                    // Parse dependencies - format could be "Task Name (ID)" or just "ID"
                    const depIds = [];
                    
                    // Try to extract IDs from parentheses
                    const matches = task.dependencies.match(/\\((\\d+)\\)/g);
                    if (matches) {
                        matches.forEach(match => {
                            const id = match.replace(/[()]/g, '');
                            depIds.push(id);
                        });
                    } else {
                        // If no parentheses, split by comma and trim
                        const parts = task.dependencies.split(',');
                        parts.forEach(part => {
                            const trimmed = part.trim();
                            if (/^\\d+$/.test(trimmed)) {
                                depIds.push(trimmed);
                            }
                        });
                    }
                    
                    // Draw line for each dependency
                    depIds.forEach(depId => {
                        const fromIndex = ganttData.findIndex(t => t.id === depId);
                        if (fromIndex !== -1) {
                            drawDependencyLine(fromIndex, toIndex);
                        }
                    });
                }
            });
        }

        function drawDependencyLine(fromIndex, toIndex) {
            const svg = document.getElementById('dependencyContainer');
            const fromTask = ganttData[fromIndex];
            const toTask = ganttData[toIndex];
            
            // Skip if tasks don't have proper dates
            if (!fromTask.endDate || !toTask.startDate) return;
            
            // Calculate positions
            const fromBar = document.querySelector(\`.gantt-bar[data-task-id="\${fromTask.id}"]\`);
            const toBar = document.querySelector(\`.gantt-bar[data-task-id="\${toTask.id}"]\`);
            
            if (!fromBar || !toBar) return;
            
            // Get bar positions
            const fromX = parseInt(fromBar.style.left) + parseInt(fromBar.style.width);
            const fromY = fromIndex * 28 + 14; // 28px total height (27 + 1 border), center at 14
            const toX = parseInt(toBar.style.left);
            const toY = toIndex * 28 + 14;
            
            // Create SVG path
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('dependency-line');
            
            // Create a nice curved path
            const midX = fromX + 20;
            const d = \`M \${fromX} \${fromY} L \${midX} \${fromY} L \${midX} \${toY} L \${toX - 5} \${toY}\`;
            
            path.setAttribute('d', d);
            path.setAttribute('data-from', fromTask.id);
            path.setAttribute('data-to', toTask.id);
            
            // Add tooltip on hover
            path.innerHTML = \`<title>\${fromTask.taskName} → \${toTask.taskName}</title>\`;
            
            svg.appendChild(path);
        }
        
        // Render timeline header
        function renderTimeline(container, totalDays) {
            const monthRow = document.createElement('div');
            monthRow.className = 'month-row';
            
            const dayRow = document.createElement('div');
            dayRow.className = 'day-row';
            
            let currentDate = new Date(minDate);
            let currentMonth = -1;
            let monthStart = 0;
            
            for (let i = 0; i < totalDays; i++) {
                // Day cell
                const dayCell = document.createElement('div');
                dayCell.className = 'day-cell';
                
                if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
                    dayCell.classList.add('weekend');
                }
                
                if (currentDate.toDateString() === today.toDateString()) {
                    dayCell.classList.add('today');
                }
                
                dayCell.textContent = currentDate.getDate();
                dayRow.appendChild(dayCell);
                
                // Check for new month
                if (currentDate.getMonth() !== currentMonth) {
                    if (currentMonth !== -1) {
                        // Finish previous month
                        const monthCell = document.createElement('div');
                        monthCell.className = 'month-cell';
                        monthCell.style.width = ((i - monthStart) * dayWidth) + 'px';
                        monthCell.textContent = getMonthName(currentMonth) + ' ' + (currentDate.getFullYear() - (currentDate.getMonth() === 0 ? 1 : 0));
                        monthRow.appendChild(monthCell);
                    }
                    currentMonth = currentDate.getMonth();
                    monthStart = i;
                }
                
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // Finish last month
            const monthCell = document.createElement('div');
            monthCell.className = 'month-cell';
            monthCell.style.width = ((totalDays - monthStart) * dayWidth) + 'px';
            monthCell.textContent = getMonthName(currentMonth) + ' ' + (currentDate.getFullYear() - 1);
            monthRow.appendChild(monthCell);
            
            container.appendChild(monthRow);
            container.appendChild(dayRow);
        }
        
        // Render grid lines
        function renderGridLines(totalDays) {
            const gridLines = document.getElementById('gridLines');
            const totalHeight = ganttData.length * 28; // 28px per row
            let currentDate = new Date(minDate);
            
            for (let i = 0; i < totalDays; i++) {
                const line = document.createElement('div');
                line.className = 'grid-line';
                line.style.left = (i * dayWidth) + 'px';
                line.style.height = totalHeight + 'px';
                
                if (currentDate.getDay() === 1) {
                    line.classList.add('week');
                }
                if (currentDate.getDate() === 1) {
                    line.classList.add('month');
                }
                
                gridLines.appendChild(line);
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
        
        // Position today line
        function positionTodayLine() {
            const todayLine = document.getElementById('todayLine');
            const daysSinceStart = Math.floor((today - minDate) / (1000 * 60 * 60 * 24));
            todayLine.style.left = (daysSinceStart * dayWidth) + 'px';
            
            // Ensure today line spans full height including all rows
            const totalHeight = ganttData.length * 28; // 28px per row
            todayLine.style.height = totalHeight + 'px';
        }
        
        // Show tooltip
        function showTooltip(event, task) {
            const tooltip = document.getElementById('tooltip');
            
            let html = \`<div class="tooltip-title">\${task.taskName}</div>\`;
            
            if (task.description) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Descripción:</span>
                    <span>\${task.description}</span>
                </div>\`;
            }
            
            if (task.assignedTo) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Asignado a:</span>
                    <span>\${task.assignedTo}</span>
                </div>\`;
            }
            
            if (task.startDate) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Inicio:</span>
                    <span>\${formatDate(task.startDate)}</span>
                </div>\`;
            }
            
            if (task.endDate) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Fin:</span>
                    <span>\${formatDate(task.endDate)}</span>
                </div>\`;
            }
            
            if (task.dias) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Duración:</span>
                    <span>\${task.dias} días</span>
                </div>\`;
            }
            
            if (task.restante !== null) {
                const restanteText = task.restante < 0 ? 
                    \`<span style="color: #ff6b6b;">Vencido hace \${Math.abs(task.restante)} días</span>\` : 
                    \`\${task.restante} días restantes\`;
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Tiempo restante:</span>
                    <span>\${restanteText}</span>
                </div>\`;
            }
            
            if (task.status) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Estado:</span>
                    <span>\${task.status}</span>
                </div>\`;
            }
            
            if (task.dependencies) {
                html += \`<div class="tooltip-row">
                    <span class="tooltip-label">Dependencias:</span>
                    <span>\${task.dependencies}</span>
                </div>\`;
            }
            
            tooltip.innerHTML = html;
            tooltip.style.display = 'block';
            
            // Position tooltip
            const rect = event.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.bottom + 5) + 'px';
            
            // Adjust if tooltip goes off screen
            setTimeout(() => {
                const tooltipRect = tooltip.getBoundingClientRect();
                if (tooltipRect.right > window.innerWidth) {
                    tooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
                }
                if (tooltipRect.bottom > window.innerHeight) {
                    tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
                }
            }, 0);
        }
        
        // Hide tooltip
        function hideTooltip() {
            document.getElementById('tooltip').style.display = 'none';
        }
        
        // Sync scroll between panels
        function syncScroll() {
            const taskPanel = document.getElementById('taskPanel');
            const ganttPanel = document.getElementById('ganttPanel');
            
            let syncing = false;
            
            // Ensure both panels start at the same position
            taskPanel.scrollTop = 0;
            ganttPanel.scrollTop = 0;
            
            taskPanel.addEventListener('scroll', () => {
                if (!syncing) {
                    syncing = true;
                    ganttPanel.scrollTop = taskPanel.scrollTop;
                    requestAnimationFrame(() => { syncing = false; });
                }
            });
            
            ganttPanel.addEventListener('scroll', () => {
                if (!syncing) {
                    syncing = true;
                    taskPanel.scrollTop = ganttPanel.scrollTop;
                    requestAnimationFrame(() => { syncing = false; });
                }
            });
        }
        
        // Toggle project expansion
        function toggleProject(projectId) {
            projectStates[projectId] = !projectStates[projectId];
            
            // Update expand icon
            const icon = document.querySelector(\`.task-row[data-task-id="\${projectId}"] .expand-icon\`);
            if (icon) {
                icon.textContent = projectStates[projectId] ? '▼' : '▶';
                icon.classList.toggle('collapsed', !projectStates[projectId]);
            }
            
            // Show/hide child tasks
            ganttData.forEach((task, index) => {
                if (task.projectId === projectId && task.id !== projectId) {
                    const taskRow = document.querySelector(\`.task-row[data-index="\${index}"]\`);
                    const ganttRow = document.querySelector(\`.gantt-row[data-index="\${index}"]\`);
                    
                    if (taskRow) taskRow.classList.toggle('collapsed', !projectStates[projectId]);
                    if (ganttRow) ganttRow.classList.toggle('collapsed', !projectStates[projectId]);
                }
            });
            
            // Re-render dependencies when expanding/collapsing
            setTimeout(() => {
                renderDependencies();
            }, 100);
        }
        
        // Select task
        function selectTask(taskId, index) {
            // Remove previous selection
            document.querySelectorAll('.task-row').forEach(row => {
                row.style.background = '';
            });
            
            // Add selection
            const taskRow = document.querySelector(\`.task-row[data-index="\${index}"]\`);
            if (taskRow && !taskRow.classList.contains('project')) {
                taskRow.style.background = '#d4e8f7';
            }
        }
        
        // Expand all projects
        function expandAll() {
            Object.keys(projectStates).forEach(projectId => {
                projectStates[projectId] = true;
            });
            renderGantt();
        }
        
        // Collapse all projects
        function collapseAll() {
            Object.keys(projectStates).forEach(projectId => {
                projectStates[projectId] = false;
            });
            renderGantt();
        }
        
        // Reset view
        function resetView() {
            const ganttPanel = document.getElementById('ganttPanel');
            ganttPanel.scrollLeft = 0;
            ganttPanel.scrollTop = 0;
            
            // Scroll to today
            const daysSinceStart = Math.floor((today - minDate) / (1000 * 60 * 60 * 24));
            const scrollPosition = (daysSinceStart * dayWidth) - (ganttPanel.offsetWidth / 2);
            ganttPanel.scrollLeft = Math.max(0, scrollPosition);
        }
        
        // Load new file
        function loadNewFile() {
            document.getElementById('uploadContainer').style.display = 'flex';
            document.getElementById('container').style.display = 'none';
            document.getElementById('fileInput').value = '';
            ganttData = [];
            projectStates = {};
        }
        
        // Format date
        function formatDate(date) {
            if (!date || isNaN(date)) return '';
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return \`\${day}/\${month}/\${year}\`;
        }
        
        // Get month name
        function getMonthName(monthIndex) {
            const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 
                           'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
            return months[monthIndex];
        }
        
        // Check if there's an existing file on load
        window.addEventListener('load', function() {
            // Optional: automatically load existing file
            // loadExistingFile();
        });
    </script>
</body>
</html>`;
}

// For local testing
if (require.main === module) {
    const testEvent = {
        httpMethod: 'GET',
        path: '/'
    };
    
    exports.handler(testEvent).then(response => {
        console.log('Response:', response.statusCode);
    });
}
