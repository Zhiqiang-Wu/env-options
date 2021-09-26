// @author 吴志强
// @date 2021/9/11

import {app, BrowserWindow, Menu, protocol, Tray, ipcMain, dialog} from 'electron';
import createProtocol from 'umi-plugin-electron-builder/lib/createProtocol';
import path from 'path';
import loadsh from 'loadsh';
import regedit from 'regedit';
import sqlite3 from 'sqlite3';
import {LowSync, JSONFileSync} from 'lowdb';
// import installExtension, {REACT_DEVELOPER_TOOLS, REDUX_DEVTOOLS} from 'electron-devtools-installer';

const isDevelopment = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow;
let tray: Tray;
let baseDB: sqlite3.Database;
let settingDB: LowSync;
const envPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

const setVBS = () => {
    if (!isDevelopment) {
        regedit.setExternalVBSLocation(path.join(__dirname, '../../vbs'));
    }
};

const createWindow = (): void => {
    let iconPath;
    if (isDevelopment) {
        iconPath = path.join(__dirname, '../../../public/favicon128.ico');
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
        iconPath = path.join(__dirname, '../../../public/favicon128.ico');
    } else {
        iconPath = path.join(__dirname, 'favicon128.ico');
    }
    tray = new Tray(iconPath);
    const menu = Menu.buildFromTemplate([
        {label: '退出', click: appQuit},
    ]);
    tray.setContextMenu(menu);
    tray.setToolTip('Env Options');
};

const connectBaseDB = (): Promise<Result> => {
    return new Promise((resolve) => {
        let baseDBPath;
        if (isDevelopment) {
            baseDBPath = path.join(__dirname, '../../../contents/base.db3');
        } else {
            baseDBPath = path.join(__dirname, '../../contents/base.db3');
        }
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
    let settingDBPath;
    if (isDevelopment) {
        settingDBPath = path.join(__dirname, '../../../contents/settings.json');
    } else {
        settingDBPath = path.join(__dirname, '../../contents/settings.json');
    }
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
                const environmentVariables: Array<EnvironmentVariable> = loadsh.keys(environmentVariableObject).map((key) => ({
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
                resolve({code: 200});
            }
        });
    });
};

const updateDatabaseEnvironmentVariable = (environmentVariable: EnvironmentVariable): Promise<Result> => {
    return new Promise<Result>((resolve) => {
        baseDB.exec(`UPDATE variable
                     SET key   = ${'\''}${environmentVariable.key}${'\''},
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

const existsSystemEnvironmentVariable = async (key: string): Promise<Result> => {
    const result: Result = await listSystemEnvironmentVariables();
    if (result.code !== 200) {
        return result;
    }
    const index = loadsh.findIndex(result.data.environmentVariables, (systemEnvironmentVariable: EnvironmentVariable) => {
        return systemEnvironmentVariable.key === key;
    });
    return {code: 200, data: {exists: index >= 0}};
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

if (!app.requestSingleInstanceLock()) {
    appQuit();
}

app.on('ready', async () => {
    /*if (isDevelopment) {
        await installExtension(REACT_DEVELOPER_TOOLS);
        await installExtension(REDUX_DEVTOOLS);
    }*/
    setVBS();
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
        const newDatabaseEnvironmentVariables: Array<EnvironmentVariable> = loadsh.differenceWith(systemEnvironmentVariables, databaseEnvironmentVariables, (systemEnvironmentVariable: EnvironmentVariable, databaseEnvironmentVariable: EnvironmentVariable) => {
            return systemEnvironmentVariable.key === databaseEnvironmentVariable.key && systemEnvironmentVariable.value === databaseEnvironmentVariable.value;
        });
        if (newDatabaseEnvironmentVariables.length > 0) {
            const statement: sqlite3.Statement = baseDB.prepare('INSERT INTO variable (key, type, value) VALUES (?, ?, ?)');
            newDatabaseEnvironmentVariables.forEach((environmentVariable: EnvironmentVariable) => {
                statement.run([environmentVariable.key, environmentVariable.type, environmentVariable.value]);
            });
            return new Promise<Result>((resolve) => {
                statement.finalize(async (err) => {
                    if (err) {
                        resolve({code: 1, message: err.message});
                    } else {
                        const result = await listDatabaseEnvironmentVariables();
                        const environmentVariables: Array<EnvironmentVariable> = result.data.environmentVariables.map((databaseEnvironmentVariable: EnvironmentVariable) => {
                            const index = loadsh.findIndex(systemEnvironmentVariables, (systemEnvironmentVariable) => {
                                return systemEnvironmentVariable.key === databaseEnvironmentVariable.key && systemEnvironmentVariable.value === databaseEnvironmentVariable.value;
                            });
                            return {
                                ...databaseEnvironmentVariable,
                                selected: index >= 0,
                            };
                        });
                        resolve({code: 200, data: {environmentVariables}});
                    }
                });
            });
        } else {
            const environmentVariables: Array<EnvironmentVariable> = databaseEnvironmentVariables.map((databaseEnvironmentVariable: EnvironmentVariable) => {
                const index = loadsh.findIndex(systemEnvironmentVariables, (systemEnvironmentVariable) => {
                    return systemEnvironmentVariable.key === databaseEnvironmentVariable.key && systemEnvironmentVariable.value === databaseEnvironmentVariable.value;
                });
                return {
                    ...databaseEnvironmentVariable,
                    selected: index >= 0,
                };
            });
            return {code: 200, data: {environmentVariables}};
        }
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

ipcMain.on('showOpenDialogSync', (event, options: OpenDialogSyncOptions) => {
    event.returnValue = dialog.showOpenDialogSync(mainWindow, options);
});
