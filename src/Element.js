//虚拟dom的格式
class Element {
    constructor(type,props) {
        this.type = type;
        this.props = props;
    }
}
//type标签名称 props属性 children子节点
function createElement(type,props,...children) {
    //如果木有属性，默认是空对象
    props = props || {};
    //将子节点作为props的属性
    props.children = children;
    //返回对象格式{type:value;props:{}}
    return new Element(type, props);
}

export {
    Element,
    createElement
};

