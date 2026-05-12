import os

SPDX_PUBLIC = "// SPDX-License-Identifier: Apache-2.0\n"
SPDX_PRIVATE = "// SPDX-License-Identifier: LicenseRef-RxM-Proprietary\n// Copyright (c) Res ex Machina. All rights reserved.\n"

def process_dir(directory, header):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith('.ts') or file.endswith('.js'):
                path = os.path.join(root, file)
                with open(path, 'r') as f:
                    content = f.read()
                
                # Check if it already has an SPDX header
                if 'SPDX-License-Identifier' not in content:
                    with open(path, 'w') as f:
                        f.write(header + ('\n' if not content.startswith('\n') else '') + content)
                    print(f"Added header to {path}")

process_dir('/home/berker/Documentos/ANTIGRAVITY/Res-ex-Machina/src', SPDX_PUBLIC)
process_dir('/home/berker/Documentos/ANTIGRAVITY/Res-ex-Machina/scripts', SPDX_PUBLIC)
process_dir('/home/berker/Documentos/ANTIGRAVITY/Res-ex-Machina/tests', SPDX_PUBLIC)
