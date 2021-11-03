// @author 吴志强
// @date 2021/9/11

import {
    app,
    BrowserWindow,
    Menu,
    protocol,
    Tray,
    ipcMain,
    dialog,
    OpenDialogReturnValue,
} from 'electron';
import createProtocol from 'umi-plugin-electron-builder/lib/createProtocol';
import path from 'path';
import lodash from 'lodash';
import regedit from 'regedit';
import sqlite3 from 'sqlite3';
import {LowSync, JSONFileSync} from 'lowdb';
import {createLogger, format, Logger} from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import {autoUpdater, UpdateCheckResult, UpdateInfo, ProgressInfo} from 'electron-updater';
import os from 'os';
import fsExtra from 'fs-extra';
import extractZip from 'extract-zip';
import {Library} from 'ffi-napi';
import ref from 'ref-napi';
// import installExtension, {REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS} from 'electron-devtools-installer';

const isDevelopment = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow;
let tray: Tray;
let baseDB: sqlite3.Database;
let settingDB: LowSync;
let logger: Logger;
let dll;
const envPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

const loadDLL = () => {
    let dllPath;
    if (isDevelopment) {
        dllPath = path.join(__dirname, '..', '..', '..', 'extra', 'env_options.dll');
    } else {
        dllPath = path.join(__dirname, '..', 'env_options.dll');
    }
    dll = Library(dllPath, {
        sendSettingChange: [ref.types.void, []],
    });
};

const setVBS = () => {
    if (!isDevelopment) {
        regedit.setExternalVBSLocation(path.join(__dirname, '..', '..', 'vbs'));
    }
};

const createWindow = (): void => {
    let iconPath;
    if (isDevelopment) {
        iconPath = path.join(__dirname, '..', '..', '..', 'public', 'favicon128.ico');
    } else {
        iconPath = path.join(__dirname, 'favicon128.ico');
    }
    mainWindow = new BrowserWindow({
        icon: iconPath,
        width: 800,
        height: 600,
        show: false,
        title: 'Env Options',
        webPreferences: {
            devTools: isDevelopment,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    if (isDevelopment) {
        mainWindow.loadURL('http://localhost:8000');
    } else {
        createProtocol('app');
        mainWindow.loadURL('app://./index.html');
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
};

const createTray = (): void => {
    let iconPath;
    if (isDevelopment) {
        iconPath = path.join(__dirname, '..', '..', '..', 'public', 'favicon128.ico');
    } else {
        iconPath = path.join(__dirname, 'favicon128.ico');
    }
    tray = new Tray(iconPath);
    const menu = Menu.buildFromTemplate([
        {label: '退出', click: appQuit},
    ]);
    tray.setContextMenu(menu);
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.focus();
        }
    });
    tray.setToolTip('Env Options');
};

const createLogger1 = (): void => {
    const customFormat = format.printf(({level, message, timestamp}) => {
        return `${timestamp} ${level} - ${message}`;
    });
    let filename;
    if (isDevelopment) {
        filename = path.join(__dirname, '..', '..', '..', 'log', '%DATE%.log');
    } else {
        filename = getDataDir() + path.sep + 'log' + path.sep + '%DATE%.log';
    }
    const transport: DailyRotateFile = new DailyRotateFile({
        filename,
        datePattern: 'YYYY-MM/YYYY-MM-DD',
        zippedArchive: true,
        maxFiles: '30d',
    });
    logger = createLogger({
        level: isDevelopment ? 'debug' : 'info',
        format: format.combine(
            format.timestamp({
                format: 'HH:mm:ss.SSS',
            }),
            format.splat(),
            customFormat,
        ),
        transports: [transport],
    });
};

const getDataDir = (): string => {
    return os.homedir() + path.sep + 'AppData' + path.sep + 'Local' + path.sep + 'env-options';
};

const checkDataFile = async () => {
    const dataDir = getDataDir();
    const baseDBExists = fsExtra.pathExistsSync(dataDir + path.sep + 'base.db3');
    const settingsExists = fsExtra.pathExistsSync(dataDir + path.sep + 'settings.json');
    if (!baseDBExists || !settingsExists) {
        let dataZipPath;
        if (isDevelopment) {
            dataZipPath = path.join(__dirname, '..', '..', '..', 'extra', 'data.zip');
        } else {
            dataZipPath = path.join(__dirname, '..', 'data.zip');
        }
        const tempPath = path.join(dataZipPath, '..', 'temp');
        await extractZip(dataZipPath, {dir: tempPath});
        fsExtra.ensureDirSync(dataDir);
        if (!baseDBExists) {
            fsExtra.copySync(tempPath + path.sep + 'base.db3', dataDir + path.sep + 'base.db3');
        }
        if (!settingsExists) {
            fsExtra.copySync(tempPath + path.sep + 'settings.json', dataDir + path.sep + 'settings.json');
        }
        fsExtra.removeSync(tempPath);
    }
};

const connectBaseDB = (): Promise<Result> => {
    return new Promise((resolve) => {
        const baseDBPath = getDataDir() + path.sep + 'base.db3';
        baseDB = new sqlite3.Database(baseDBPath, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const connectSettingDB = () => {
    const settingDBPath = getDataDir() + path.sep + 'settings.json';
    const adapter = new JSONFileSync(settingDBPath);
    settingDB = new LowSync(adapter);
    settingDB.read();
};

const listDatabaseEnvironmentVariables = (): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.all('SELECT * FROM variable', (err, result) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200, data: {environmentVariables: result}});
            }
        });
    });
};

const listSystemEnvironmentVariables = (): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        regedit.list(envPath, (err, result) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                const environmentVariableObject = result[envPath].values;
                const environmentVariables: Array<any> = lodash.keys(environmentVariableObject).map((key) => ({
                    key,
                    type: environmentVariableObject[key].type,
                    value: environmentVariableObject[key].value,
                    selected: true,
                }));
                resolve({code: 200, data: {environmentVariables}});
            }
        });
    });
};

const deleteSystemEnvironmentVariable = (key: string): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        regedit.deleteValue([`${envPath}\\${key}`], (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                if (!dll) {
                    loadDLL();
                }
                dll.sendSettingChange();
                resolve({code: 200});
            }
        });
    });
};

const insertSystemEnvironmentVariable = (environmentVariable: EnvironmentVariable): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        const value = {
            [`${envPath}`]: {
                [`${environmentVariable.key}`]: {
                    type: environmentVariable.type,
                    value: environmentVariable.value,
                },
            },
        };
        regedit.putValue(value, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                if (!dll) {
                    loadDLL();
                }
                dll.sendSettingChange();
                resolve({code: 200});
            }
        });
    });
};

const updateDatabaseEnvironmentVariable = (environmentVariable: EnvironmentVariable): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`UPDATE variable
                     SET key   = ${'\''}${environmentVariable.key}${'\''},
                         type  = ${'\''}${environmentVariable.type}${'\''},
                         value = ${'\''}${environmentVariable.value}${'\''}
                     WHERE id = ${environmentVariable.id}`, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const deleteDatabaseEnvironmentVariable = (id: number): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`DELETE
                     FROM variable
                     WHERE id = ${id}`, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const insertDatabaseEnvironmentVariable = (environmentVariable: EnvironmentVariable): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        const sql = `INSERT INTO variable (key, type, value)
                     VALUES (${'\''}${environmentVariable.key}${'\''}, ${'\''}${environmentVariable.type}${'\''},
                             ${'\''}${environmentVariable.value}${'\''})`;
        baseDB.exec(sql, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const getDatabaseEnvironmentVariable = (id: number): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.get(`SELECT *
                    FROM variable
                    WHERE id = ${id}`, (err, row) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200, data: {environmentVariable: row}});
            }
        });
    });
};

const lockDatabaseEnvironmentVariable = (id: number): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`UPDATE variable
                     SET locked = 1
                     WHERE id = ${id}`, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const unlockDatabaseEnvironmentVariable = (id: number): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`UPDATE variable
                     SET locked = 0
                     WHERE id = ${id}`, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const updateDatabaseEnvironmentVariableKey = ({id, key}: {id: number; key:string}): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`UPDATE variable
                     SET key = ${'\''}${key}${'\''}
                     WHERE id = ${id}`, (err) => {
            if (err) {
                resolve({code: 1, message: err.message});
            } else {
                resolve({code: 200});
            }
        });
    });
};

const getSetting = (key: string): Result => {
    const {data}: any = settingDB;
    const value = data[key];
    return {
        code: 200,
        data: {
            [`${key}`]: value,
        },
    };
};

const updateSetting = (settings: Array<Setting>): Result => {
    const {data}: any = settingDB;
    settings.forEach((setting) => {
        data[setting.key] = setting.value;
    });
    settingDB.write();
    return {code: 200};
};

const checkForUpdates = (): Promise<Result> => {
    return autoUpdater.checkForUpdates().then((result: UpdateCheckResult) => {
        return {
            code: 200,
            data: result,
        };
    }).catch((err: Error) => {
        return {
            code: 1,
            message: err.message,
        };
    });
};

const downloadUpdate = (): Promise<Result> => {
    // 只有下载结束或出异常后返回
    return autoUpdater.downloadUpdate().then((result) => {
        return {code: 200, data: result};
    }).catch((err: Error) => {
        return {code: 1, message: err.message};
    });
};

const quitAndInstall = (): void => {
    if (baseDB) {
        baseDB.close(() => {
            autoUpdater.quitAndInstall();
        });
    } else {
        autoUpdater.quitAndInstall();
    }
};

const appQuit = (): void => {
    if (baseDB) {
        baseDB.close(() => {
            app.quit();
        });
    } else {
        app.quit();
    }
};

protocol.registerSchemesAsPrivileged([
    {scheme: 'app', privileges: {secure: true, standard: true}},
]);

autoUpdater.autoDownload = false;

autoUpdater.fullChangelog = true;

autoUpdater.on('error', (error: Error) => {
    mainWindow.webContents.send('updateError', error);
});

if (!isDevelopment) {
    autoUpdater.on('update-available', (updateInfo: UpdateInfo) => {
        mainWindow.webContents.send('updateAvailable', updateInfo);
    });

    autoUpdater.on('update-not-available', (updateInfo: UpdateInfo) => {
        mainWindow.webContents.send('updateNotAvailable', updateInfo);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
        mainWindow.webContents.send('updateDownloadProgress', progress);
    });

    autoUpdater.on('update-downloaded', (updateInfo: UpdateInfo) => {
        mainWindow.webContents.send('updateDownloaded', updateInfo);
    });
}

if (!app.requestSingleInstanceLock()) {
    appQuit();
}

app.on('ready', async () => {
    /*if (isDevelopment) {
        await installExtension(REACT_DEVELOPER_TOOLS);
        await installExtension(REDUX_DEVTOOLS);
    }*/
    await checkDataFile();
    setVBS();
    createLogger1();
    await connectBaseDB();
    connectSettingDB();
    createWindow();
    createTray();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        appQuit();
    }
});

app.on('second-instance', () => {
    if (mainWindow) {
        mainWindow.focus();
    }
});

ipcMain.handle('listEnvironmentVariables', async () => {
    return Promise.all([listSystemEnvironmentVariables(), listDatabaseEnvironmentVariables()]).then((resultArray: Array<Result>) => {
        const result1 = resultArray[0];
        if (result1.code !== 200) {
            return result1;
        }
        const result2 = resultArray[1];
        if (result2.code !== 200) {
            return result2;
        }
        const systemEnvironmentVariables: Array<EnvironmentVariable> = result1.data.environmentVariables;
        const databaseEnvironmentVariables: Array<EnvironmentVariable> = result2.data.environmentVariables;

        const statement: sqlite3.Statement = baseDB.prepare('INSERT INTO variable (key, type, value) VALUES (?, ?, ?)');
        const statement2: sqlite3.Statement = baseDB.prepare('UPDATE variable SET key = ? WHERE id = ?');
        systemEnvironmentVariables.forEach((systemEnvironmentVariable) => {
            const databaseEnvironmentVariable = databaseEnvironmentVariables.find((databaseEnvironmentVariable) => {
                return systemEnvironmentVariable.key.toUpperCase() === databaseEnvironmentVariable.key.toUpperCase() && systemEnvironmentVariable.value === databaseEnvironmentVariable.value;
            });
            if (databaseEnvironmentVariable) {
                if (databaseEnvironmentVariable.key !== systemEnvironmentVariable.key) {
                    statement2.run([systemEnvironmentVariable.key, databaseEnvironmentVariable.id]);
                }
            } else {
                statement.run([systemEnvironmentVariable.key, systemEnvironmentVariable.type, systemEnvironmentVariable.value]);
            }
        });

        // 新增
        const p1 = new Promise<boolean>((resolve) => {
            statement.finalize((err) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
        // 同步key大小写
        const p2 = new Promise<boolean>((resolve) => {
            statement2.finalize((err) => {
                if (err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });

        return Promise.all([p1, p2]).then(async (value) => {
            if (value[0] && value[1]) {
                const result = await listDatabaseEnvironmentVariables();
                const environmentVariables: Array<EnvironmentVariable> = result.data.environmentVariables.map((databaseEnvironmentVariable: EnvironmentVariable) => {
                    const index = systemEnvironmentVariables.findIndex((systemEnvironmentVariable) => {
                        return systemEnvironmentVariable.key.toUpperCase() === databaseEnvironmentVariable.key.toUpperCase() && systemEnvironmentVariable.value === databaseEnvironmentVariable.value;
                    });
                    return {
                        ...databaseEnvironmentVariable,
                        selected: index >= 0,
                    };
                });
                return {code: 200, data: {environmentVariables}};
            } else {
                return {code:1, message: '获取环境变量失败'};
            }
        });
    });
});

ipcMain.handle('setEnvironmentVariable', (event, environmentVariable: EnvironmentVariable) => {
    if (environmentVariable.selected) {
        return insertSystemEnvironmentVariable(environmentVariable);
    } else {
        return deleteSystemEnvironmentVariable(environmentVariable.key);
    }
});

ipcMain.handle('deleteEnvironmentVariable', async (event, environmentVariable: EnvironmentVariable): Promise<Result> => {
    return deleteDatabaseEnvironmentVariable(environmentVariable.id);
});

ipcMain.handle('insertEnvironmentVariable', (event, environmentVariable: EnvironmentVariable): Promise<Result> => {
    return insertDatabaseEnvironmentVariable(environmentVariable);
});

ipcMain.handle('getEnvironmentVariable', (event, id): Promise<Result> => {
    return getDatabaseEnvironmentVariable(id);
});

ipcMain.handle('updateEnvironmentVariable', (event, environmentVariable: EnvironmentVariable) => {
    return updateDatabaseEnvironmentVariable(environmentVariable);
});

ipcMain.handle('getSetting', (event, key: string): Result => {
    return getSetting(key);
});

ipcMain.handle('updateSetting', (event, settings: Array<Setting>): Result => {
    return updateSetting(settings);
});

ipcMain.handle('unlockDatabaseEnvironmentVariable', (event, id: number): Promise<Result> => {
    return unlockDatabaseEnvironmentVariable(id);
});

ipcMain.handle('lockDatabaseEnvironmentVariable', (event, id: number): Promise<Result> => {
    return lockDatabaseEnvironmentVariable(id);
});

ipcMain.handle('checkForUpdates', (): Promise<Result> => {
    return checkForUpdates();
});

ipcMain.handle('downloadUpdate', (): Promise<Result> => {
    return downloadUpdate();
});

ipcMain.on('quitAndInstall', (): void => {
    quitAndInstall();
});

ipcMain.handle('showOpenDialog', (event, options: OpenDialogOptions1): Promise<OpenDialogReturnValue> => {
    if (options.modal) {
        return dialog.showOpenDialog(mainWindow, options);
    } else {
        return dialog.showOpenDialog(options);
    }
});

ipcMain.on('log', (event, args) => {
    logger.log(args.level, args.message, ...args.meta);
});
