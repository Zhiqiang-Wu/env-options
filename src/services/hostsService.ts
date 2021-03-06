// @author 吴志强
// @date 2021/1/14

export const listHosts = (): Promise<Result> => {
    return window.localServices.listHosts();
};

export const setHost = (host: Host): Promise<Result> => {
    return window.localServices.setHost(host);
};

export const deleteHost = (host: Host): Promise<Result> => {
    return window.localServices.deleteHost(host);
};

export const openHostsFile = (): void => {
    return window.localServices.openHostsFile();
};

export const readHostsFile = (): Promise<Result> => {
    return window.localServices.readHostsFile();
};

export const writeHostsFile = (str: string): Promise<Result> => {
    return window.localServices.writeHostsFile(str);
};

export const insertHost = (value): Promise<Result> => {
    return window.localServices.insertHost(value);
};
