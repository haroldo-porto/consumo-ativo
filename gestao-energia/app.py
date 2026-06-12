import os
import cv2
import numpy as np
import math
import base64
from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

# Configurações de diretórios estáticos
# Flask já gerencia as pastas static e templates por padrão

def get_ray_darkness(gray_img, center, angle_deg, max_r):
    """
    Calcula a escuridão média (255 - valor_pixel) ao longo de um raio
    a partir do centro no ângulo especificado, focando na metade externa (0.3*r até 0.8*r).
    """
    lcx, lcy = center
    angle_rad = math.radians(angle_deg)
    
    intensities = []
    r_start = int(max_r * 0.3)
    r_end = int(max_r * 0.8)
    
    h, w = gray_img.shape[:2]
    
    for r_val in range(r_start, r_end):
        px = int(lcx + r_val * math.cos(angle_rad))
        py = int(lcy + r_val * math.sin(angle_rad))
        
        if 0 <= px < w and 0 <= py < h:
            intensities.append(gray_img[py, px])
            
    if not intensities:
        return 0
    
    return np.mean([255 - val for val in intensities])

def process_meter_image(cv_img):
    """
    Processa a imagem OpenCV do medidor de energia.
    Retorna uma tupla (leitura_final, lista_digitos, imagem_processada_cv) ou (None, None, None) em caso de erro.
    """
    # Redimensionar para largura de 1000px
    h, w = cv_img.shape[:2]
    new_w = 1000
    new_h = int(h * (new_w / w))
    img_resized = cv2.resize(cv_img, (new_w, new_h))
    
    # 1. Pré-processar imagem para detecção de círculos
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    
    # Restringir a busca de círculos à região central vertical (onde os mostradores sempre ficam)
    y_min_roi = int(new_h * 0.25)
    y_max_roi = int(new_h * 0.75)
    roi_gray = gray[y_min_roi:y_max_roi, :]
    roi_blurred = cv2.medianBlur(roi_gray, 5)
    
    # Detectar todos os círculos candidatos na ROI
    circles = cv2.HoughCircles(
        roi_blurred, 
        cv2.HOUGH_GRADIENT, 
        dp=1.2, 
        minDist=45, 
        param1=50, 
        param2=22, 
        minRadius=40, 
        maxRadius=95
    )
    
    from itertools import combinations
    
    best_group = None
    if circles is not None:
        # Limit to top 25 to avoid combinatorial explosion (HoughCircles returns sorted by strength)
        circles = circles[0, :25]
        all_dials = []
        for (cx, cy, r) in circles:
            all_dials.append((cx, cy + y_min_roi, r))
            
        min_score = float('inf')
        
        # 1. Try to find a group of 4 aligned dials
        groups_4 = []
        for c1 in all_dials:
            group = [c1]
            for c2 in all_dials:
                if c1 != c2 and abs(c1[1] - c2[1]) < 35:
                    group.append(c2)
            if len(group) >= 4:
                unique_group = []
                for item in group:
                    if item not in unique_group:
                        unique_group.append(item)
                if len(unique_group) >= 4:
                    groups_4.append(unique_group)
                    
        for group in groups_4:
            for comb in combinations(group, 4):
                sorted_comb = sorted(comb, key=lambda c: c[0])
                ys = [c[1] for c in sorted_comb]
                radii = [c[2] for c in sorted_comb]
                
                dx1 = sorted_comb[1][0] - sorted_comb[0][0]
                dx2 = sorted_comb[2][0] - sorted_comb[1][0]
                dx3 = sorted_comb[3][0] - sorted_comb[2][0]
                
                y_variance = np.var(ys)
                r_variance = np.var(radii)
                spacing_variance = np.var([dx1, dx2, dx3])
                
                score = y_variance + r_variance * 2 + spacing_variance
                avg_r = np.mean(radii)
                avg_spacing = np.mean([dx1, dx2, dx3])
                
                # Broadened spacing check to support different image scales/distances
                if y_variance < 100 and r_variance < 100:
                    if avg_spacing > 1.0 * avg_r and avg_spacing < 3.2 * avg_r:
                        if score < min_score:
                            min_score = score
                            best_group = sorted_comb
                            
        # 2. If 4 aligned dials not found, try to find 3 and extrapolate
        if best_group is None:
            groups_3 = []
            for c1 in all_dials:
                group = [c1]
                for c2 in all_dials:
                    if c1 != c2 and abs(c1[1] - c2[1]) < 30:
                        group.append(c2)
                if len(group) >= 3:
                    unique_group = []
                    for item in group:
                        if item not in unique_group:
                            unique_group.append(item)
                    if len(unique_group) >= 3:
                        groups_3.append(unique_group)
                        
            best_3_group = None
            min_score_3 = float('inf')
            
            for group in groups_3:
                for comb in combinations(group, 3):
                    sorted_comb = sorted(comb, key=lambda c: c[0])
                    ys = [c[1] for c in sorted_comb]
                    radii = [c[2] for c in sorted_comb]
                    
                    dx1 = sorted_comb[1][0] - sorted_comb[0][0]
                    dx2 = sorted_comb[2][0] - sorted_comb[1][0]
                    
                    y_variance = np.var(ys)
                    r_variance = np.var(radii)
                    spacing_diff = abs(dx1 - dx2)
                    
                    score = y_variance + r_variance * 2 + spacing_diff
                    avg_r = np.mean(radii)
                    avg_spacing = np.mean([dx1, dx2])
                    
                    if y_variance < 80 and r_variance < 80 and spacing_diff < 30:
                        if avg_spacing > 1.0 * avg_r and avg_spacing < 3.2 * avg_r:
                            if score < min_score_3:
                                min_score_3 = score
                                best_3_group = sorted_comb
                                
            if best_3_group is not None:
                d3 = sorted(best_3_group, key=lambda c: c[0])
                dx = (d3[1][0] - d3[0][0] + d3[2][0] - d3[1][0]) / 2.0
                avg_y = int(np.mean([c[1] for c in d3]))
                avg_r = int(np.mean([c[2] for c in d3]))
                
                # Compare two extrapolation options (center should be close to 500)
                cx4_a = int(d3[2][0] + dx)
                dist_a = abs(((d3[0][0] + cx4_a) / 2.0) - 500.0)
                
                cx1_b = int(d3[0][0] - dx)
                dist_b = abs(((cx1_b + d3[2][0]) / 2.0) - 500.0)
                
                if dist_a < dist_b:
                    extrapolated = (cx4_a, avg_y, avg_r)
                    best_group = [d3[0], d3[1], d3[2], extrapolated]
                else:
                    extrapolated = (cx1_b, avg_y, avg_r)
                    best_group = [extrapolated, d3[0], d3[1], d3[2]]
                    
    # 3. Fallback: Centered Static Layout Template
    if best_group is None:
        cx_exp_list = [248, 416, 584, 752]
        cy_exp = int(new_h * 0.48)
        r_exp = 65
        best_group = []
        for cx_exp in cx_exp_list:
            best_group.append((cx_exp, cy_exp, r_exp))
            
    # Convert all coordinates to integers
    best_group = [(int(round(c[0])), int(round(c[1])), int(round(c[2]))) for c in best_group]
        
    # 4. Processar ponteiros (Método Híbrido)
    img_draw = img_resized.copy()
    raw_readings = []
    directions = ["CCW", "CW", "CCW", "CW"]
    
    for i, (cx, cy, r) in enumerate(best_group):
        margin = int(r * 0.15)
        x_start = max(0, cx - r - margin)
        y_start = max(0, cy - r - margin)
        x_end = min(new_w, cx + r + margin)
        y_end = min(new_h, cy + r + margin)
        
        dial_crop = img_resized[y_start:y_end, x_start:x_end]
        lcx = cx - x_start
        lcy = cy - y_start
        
        gray = cv2.cvtColor(dial_crop, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        gray_enhanced = clahe.apply(gray)
        
        # Hough Lines
        blurred = cv2.GaussianBlur(gray_enhanced, (5, 5), 0)
        edges = cv2.Canny(blurred, 40, 120, apertureSize=3)
        min_line_len = int(r * 0.35)
        max_line_gap = int(r * 0.15)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=15, minLineLength=min_line_len, maxLineGap=max_line_gap)
        
        candidates = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                d1 = math.sqrt((x1 - lcx)**2 + (y1 - lcy)**2)
                d2 = math.sqrt((x2 - lcx)**2 + (y2 - lcy)**2)
                if min(d1, d2) < r * 0.35:
                    dy = y2 - y1
                    dx = x2 - x1
                    angle_deg = math.degrees(math.atan2(dy, dx))
                    candidates.append(angle_deg % 360)
                    candidates.append((angle_deg + 180) % 360)
                    
        # Polar Warp fallback
        polar_h = r
        polar_w = 360
        polar_img = cv2.warpPolar(
            gray_enhanced,
            (polar_w, polar_h),
            (float(lcx), float(lcy)),
            float(r),
            cv2.WARP_POLAR_LINEAR + cv2.WARP_FILL_OUTLIERS
        )
        r_min = int(r * 0.25)
        r_max = int(r * 0.75)
        angular_intensity = np.mean(polar_img[r_min:r_max, :], axis=0)
        polar_best_angle = np.argmin(angular_intensity)
        candidates.append(polar_best_angle)
        candidates.append((polar_best_angle + 180) % 360)
        
        # Validar candidato
        best_angle = None
        max_darkness = -1
        for cand in candidates:
            darkness = get_ray_darkness(gray_enhanced, (lcx, lcy), cand, r)
            if darkness > max_darkness:
                max_darkness = darkness
                best_angle = cand
                
        # Converter para o medidor
        meter_angle = (best_angle - 270) % 360
        direction = directions[i]
        if direction == "CW":
            val_raw = (meter_angle / 36.0) % 10.0
        else:
            val_raw = ((360.0 - meter_angle) / 36.0) % 10.0
            
        raw_readings.append(val_raw)
        
        # Desenhar marcações
        cv2.circle(img_draw, (cx, cy), r, (255, 0, 0), 2)
        angle_rad = math.radians(best_angle)
        px_end = int(cx + r * 0.75 * math.cos(angle_rad))
        py_end = int(cy + r * 0.75 * math.sin(angle_rad))
        cv2.line(img_draw, (cx, cy), (px_end, py_end), (0, 255, 0), 3)
        cv2.circle(img_draw, (cx, cy), 4, (0, 0, 255), -1)
        
    # 5. Ajuste Cruzado (Carry)
    adjusted_digits = [0, 0, 0, 0]
    adjusted_digits[3] = int(math.floor(raw_readings[3]))
    
    for i in range(2, -1, -1):
        raw_val = raw_readings[i]
        floor_val = int(math.floor(raw_val))
        right_val = raw_readings[i+1]
        
        expected_fraction = right_val / 10.0
        best_digit = floor_val
        min_diff = float('inf')
        
        for d in [floor_val - 1, floor_val, floor_val + 1]:
            d_mod = d % 10
            theoretical = d_mod + expected_fraction
            diff = abs(raw_val - theoretical)
            if diff > 5:
                diff = 10 - diff
            if diff < min_diff:
                min_diff = diff
                best_digit = d_mod
                
        adjusted_digits[i] = best_digit
        
    final_reading = "".join(map(str, adjusted_digits))
    
    # Adicionar legendas na imagem resultante
    legenda = f"Leitura: {final_reading} kWh"
    cv2.putText(img_draw, legenda, (40, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
    for idx, digit in enumerate(adjusted_digits):
        cx, cy, r = best_group[idx]
        cv2.putText(img_draw, f"{digit}", (cx - 15, cy - r - 10), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 3)
        cv2.putText(img_draw, f"raw:{raw_readings[idx]:.1f}", (cx - 35, cy + r + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        
    return final_reading, adjusted_digits, img_draw

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/read', methods=['POST'])
def api_read():
    if 'image' not in request.files:
        return jsonify({"success": False, "error": "Nenhum arquivo enviado."}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({"success": False, "error": "Nome de arquivo inválido."}), 400
        
    try:
        # Ler arquivo como array de bytes para o OpenCV
        filestr = file.read()
        npimg = np.frombuffer(filestr, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        
        if img is None:
            return jsonify({"success": False, "error": "Arquivo enviado não é uma imagem válida."}), 400
            
        reading, digits, processed_img = process_meter_image(img)
        
        if reading is None:
            return jsonify({"success": False, "error": digits}), 422
            
        # Converter imagem processada para Base64 para exibir no front-end
        _, buffer = cv2.imencode('.jpg', processed_img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        img_url = f"data:image/jpeg;base64,{img_base64}"
        
        return jsonify({
            "success": True,
            "reading": int(reading),
            "digits": digits,
            "image_url": img_url
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Erro interno ao processar: {str(e)}"}), 500

if __name__ == '__main__':
    # Ler porta da variável de ambiente (padrão Render) ou usar 5000 localmente
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
